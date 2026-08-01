import { prisma } from "@/lib/db";
import { llm } from "@/lib/llm";
import type { RewriteAccountInput, RewriteBatchInput } from "@/lib/llm";
import { buildPrompt, type AccountPromptOverrides } from "@/lib/llm/prompt";
import { loadPromptConfig } from "@/lib/prompt-config";
import type { JobQueue } from "@/lib/queue";
import type { Platform } from "@/lib/platforms";

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

  // Idempotency: kalau semua rendition sudah punya caption/thumbText, skip LLM.
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
    }));

    // Deteksi mode dari data Job. XOR sudah divalidasi di API, tapi guard di sini
    // untuk safety kalau row lama / edge case.
    const hasDesc = !!job.description;
    const hasPair = !!job.baseCaption && !!job.baseThumbText;
    let input: RewriteBatchInput;
    if (hasDesc && !hasPair) {
      input = { mode: "generate", description: job.description!, accounts };
    } else if (!hasDesc && hasPair) {
      input = {
        mode: "rewrite",
        baseCaption: job.baseCaption!,
        baseThumbText: job.baseThumbText!,
        accounts,
      };
    } else {
      // Data tidak konsisten (dua-duanya atau tidak ada) → fail semua rendition.
      await failAllRenditions(
        jobId,
        job.renditions.map((r) => r.id),
        "Job tidak punya input yang valid (description atau baseCaption+baseThumbText)."
      );
      return;
    }

    const config = await loadPromptConfig();
    const overrides: AccountPromptOverrides = new Map(
      job.renditions.map((r) => [r.accountId, r.account.promptStyle ?? null])
    );
    const composedPrompt = buildPrompt(input, config, overrides);

    const provider = await llm();

    // Mode generate wajib LLM sungguhan — NullLLMProvider tidak bisa produce caption
    // dari deskripsi. Kalau provider = null → fail semua.
    if (input.mode === "generate" && provider.id === "null") {
      await failAllRenditions(
        jobId,
        job.renditions.map((r) => r.id),
        "Mode description butuh LLM provider aktif (LLM_PROVIDER=null). Set ANTHROPIC_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY dan set LLM_PROVIDER."
      );
      return;
    }

    const result = await provider.rewriteBatch(input, composedPrompt);

    const okCount = result.items.filter((i) => i.ok).length;
    const failCount = result.items.length - okCount;
    const fbCount = result.items.filter((i) => i.ok && i.fellBack).length;
    console.log(
      `[job-prep] mode=${input.mode} ${provider.id}/${provider.model} ${result.latencyMs}ms — ok:${okCount} fail:${failCount} fellBack:${fbCount}`
    );

    // Tulis hasil per akun. Sukses → update caption+thumbText; gagal → mark FAILED.
    await prisma.$transaction(
      result.items.map((item) => {
        if (item.ok) {
          return prisma.rendition.update({
            where: { jobId_accountId: { jobId, accountId: item.accountId } },
            data: {
              caption: item.caption,
              thumbText: item.thumbText,
            },
          });
        }
        return prisma.rendition.update({
          where: { jobId_accountId: { jobId, accountId: item.accountId } },
          data: {
            status: "FAILED",
            errorMessage: `LLM: ${item.reason}`,
            finishedAt: new Date(),
          },
        });
      })
    );

    // Kalau semua rendition FAILED → tandai Job FAILED sekalian.
    if (okCount === 0) {
      await prisma.job.update({
        where: { id: jobId },
        data: { status: "FAILED", completedAt: new Date() },
      });
      return;
    }
  }

  // Enqueue render untuk rendition yang punya caption+thumbText dan belum DONE/FAILED.
  const fresh = await prisma.rendition.findMany({
    where: { jobId },
    select: { id: true, status: true, caption: true, thumbText: true },
  });
  for (const r of fresh) {
    if (r.status === "DONE" || r.status === "FAILED") continue;
    if (!r.caption || !r.thumbText) continue;
    await q.enqueue("render-rendition", { renditionId: r.id });
  }
}

async function failAllRenditions(
  jobId: string,
  renditionIds: string[],
  message: string
): Promise<void> {
  console.error(`[job-prep] Job ${jobId} FAILED: ${message}`);
  await prisma.$transaction([
    prisma.rendition.updateMany({
      where: { id: { in: renditionIds } },
      data: {
        status: "FAILED",
        errorMessage: message,
        finishedAt: new Date(),
      },
    }),
    prisma.job.update({
      where: { id: jobId },
      data: { status: "FAILED", completedAt: new Date() },
    }),
  ]);
}
