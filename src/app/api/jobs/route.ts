import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { queue, ensureHandlersRegistered } from "@/lib/queue";

const bodySchema = z.object({
  sourceKey: z.string().min(1),
  baseCaption: z.string().trim().min(1).max(5000),
  baseThumbText: z.string().trim().min(1).max(200),
  accountIds: z.array(z.string()).min(1).max(20),
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

  // Buat Job + 10 Rendition dalam transaksi
  const job = await prisma.job.create({
    data: {
      sourceKey: parsed.data.sourceKey,
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

  // Enqueue job-prep (LLM batch + fan-out ke render tasks)
  await ensureHandlersRegistered();
  const q = await queue();
  await q.enqueue("job-prep", { jobId: job.id });

  return NextResponse.json({ id: job.id, status: job.status, renditionCount: job.renditions.length }, { status: 201 });
}
