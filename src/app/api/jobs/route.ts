import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { queue, ensureHandlersRegistered } from "@/lib/queue";
import { storage } from "@/lib/storage";

const thumbnailInputSchema = z.object({
  accountId: z.string(),
  thumbnailKey: z.string(), // path preview atau uploaded
  source: z.enum(["AUTO", "MANUAL"]),
  timestampSec: z.number().optional(),
});

const bodySchema = z.object({
  sourceKey: z.string().min(1),
  sourceDuration: z.number().optional(),
  baseCaption: z.string().trim().min(1).max(5000),
  baseThumbText: z.string().trim().min(1).max(200),
  accountIds: z.array(z.string()).min(1).max(20),
  thumbnails: z.array(thumbnailInputSchema).optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Verifikasi akun ada + punya template
  const accounts = await prisma.account.findMany({
    where: { id: { in: parsed.data.accountIds }, isActive: true },
    include: { template: { select: { id: true } } },
  });
  if (accounts.length !== parsed.data.accountIds.length) {
    return NextResponse.json({ error: "Sebagian akun tidak ditemukan atau nonaktif" }, { status: 400 });
  }
  const missingTemplate = accounts.filter((a) => !a.template);
  if (missingTemplate.length > 0) {
    return NextResponse.json(
      {
        error: "Sebagian akun belum punya template",
        missing: missingTemplate.map((a) => ({ id: a.id, handle: a.handle })),
      },
      { status: 400 }
    );
  }

  const thumbnailByAccount = new Map(
    (parsed.data.thumbnails ?? []).map((t) => [t.accountId, t])
  );

  // Buat Job + N Rendition
  const job = await prisma.job.create({
    data: {
      sourceKey: parsed.data.sourceKey,
      sourceDuration: parsed.data.sourceDuration ?? null,
      baseCaption: parsed.data.baseCaption,
      baseThumbText: parsed.data.baseThumbText,
      status: "QUEUED",
      renditions: {
        create: accounts.map((a) => ({
          accountId: a.id,
          status: "PENDING",
        })),
      },
    },
    include: { renditions: true },
  });

  // Copy thumbnail preview/uploaded → renditions/pre/{jobId}/{renditionId}/thumb.jpg
  // supaya lifecycle rule R2 (7 hari untuk prefix thumbnails/preview & uploaded)
  // tidak menghapus thumbnail yang sudah "milik" rendition.
  await Promise.all(
    job.renditions.map(async (r) => {
      const input = thumbnailByAccount.get(r.accountId);
      if (!input) return;
      try {
        const obj = await storage().get(input.thumbnailKey);
        if (!obj) throw new Error(`Preview thumbnail tidak ditemukan: ${input.thumbnailKey}`);
        const finalKey = `renditions/pre/${job.id}/${r.id}/thumb.jpg`;
        await storage().put(finalKey, obj.buffer, obj.contentType || "image/jpeg");
        await prisma.rendition.update({
          where: { id: r.id },
          data: {
            thumbnailKey: finalKey,
            thumbnailSource: input.source,
            thumbnailTimestampSec: input.timestampSec ?? null,
          },
        });
      } catch (err) {
        // Non-fatal: worker akan fallback ke extract dari output (detik 2)
        console.warn(
          `[jobs] Gagal claim thumbnail untuk rendition ${r.id}: ${(err as Error).message}. ` +
            `Worker akan fallback ke thumbnail default.`
        );
      }
    })
  );

  // Enqueue job-prep (LLM batch + fan-out ke render tasks)
  await ensureHandlersRegistered();
  const q = await queue();
  await q.enqueue("job-prep", { jobId: job.id });

  return NextResponse.json({ id: job.id, status: job.status, renditionCount: job.renditions.length }, { status: 201 });
}
