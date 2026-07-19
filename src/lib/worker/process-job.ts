import { prisma } from "@/lib/db";
import { llm } from "@/lib/llm";
import type { RewriteAccountInput } from "@/lib/llm";
import { buildPrompt, type AccountPromptOverrides } from "@/lib/llm/prompt";
import { loadPromptConfig } from "@/lib/prompt-config";
import type { JobQueue } from "@/lib/queue";
import { PLATFORM_THUMB_MAX, type Platform } from "@/lib/platforms";

// job-prep: satu panggilan LLM per Job (plan.md §6), hemat 10x biaya + jamin variasi.
// Hasilnya ditulis ke setiap Rendition.caption/thumbText, lalu 10 tasks
// "render-rendition" di-enqueue.
export async function processJobPrep(jobId: string, q: JobQueue): Promise<void> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      renditions: {
        include: { account: true },
      },
    },
  });
  if (!job) {
    console.warn(`[job-prep] Job ${jobId} tidak ditemukan, skip.`);
    return;
  }

  // Idempotency: kalau sudah pernah masuk PROCESSING dan semua rendition sudah
  // punya caption, langsung enqueue render tanpa panggil LLM lagi.
  const allWritten = job.renditions.every((r) => r.caption && r.thumbText);
  if (!allWritten) {
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "PROCESSING" },
    });
    await prisma.rendition.updateMany({
      where: { jobId, status: "PENDING" },
      data: { status: "WRITING" },
    });

    const accounts: RewriteAccountInput[] = job.renditions.map((r) => ({
      accountId: r.accountId,
      handle: r.account.handle,
      platform: r.account.platform as Platform,
      maxThumbChars: PLATFORM_THUMB_MAX[r.account.platform as Platform] ?? 80,
    }));

    // Load prompt config + per-akun override → compose prompt final.
    const config = await loadPromptConfig();
    const overrides: AccountPromptOverrides = new Map(
      job.renditions.map((r) => [r.accountId, r.account.promptStyle ?? null])
    );
    const input = {
      baseCaption: job.baseCaption,
      baseThumbText: job.baseThumbText,
      accounts,
    };
    const composedPrompt = buildPrompt(input, config, overrides);

    const provider = await llm();
    const result = await provider.rewriteBatch(input, composedPrompt);

    console.log(
      `[job-prep] ${provider.id}/${provider.model} ${result.latencyMs}ms — fallback: ${result.items.filter((i) => i.fellBack).length}/${result.items.length}`
    );

    // Tulis hasil per akun (transaksi supaya konsisten)
    await prisma.$transaction(
      result.items.map((item) =>
        prisma.rendition.update({
          where: { jobId_accountId: { jobId, accountId: item.accountId } },
          data: {
            caption: item.caption,
            thumbText: item.thumbText,
          },
        })
      )
    );
  }

  // Enqueue render untuk setiap rendition yang belum DONE
  for (const r of job.renditions) {
    if (r.status === "DONE") continue;
    await q.enqueue("render-rendition", { renditionId: r.id });
  }
}
