import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { queue, ensureHandlersRegistered } from "@/lib/queue";

const bodySchema = z.object({
  sourceKey: z.string().min(1),
  accountIds: z.array(z.string()).min(1).max(20),
});

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Validasi akun ada + aktif
  const accounts = await prisma.account.findMany({
    where: { id: { in: parsed.data.accountIds }, isActive: true },
    select: { id: true },
  });
  if (accounts.length !== parsed.data.accountIds.length) {
    return NextResponse.json(
      { error: "Sebagian akun tidak ditemukan atau nonaktif" },
      { status: 400 }
    );
  }

  // Simpan accountIds di progress supaya worker punya info lengkap tanpa payload lain
  const task = await prisma.thumbnailTask.create({
    data: {
      sourceKey: parsed.data.sourceKey,
      status: "QUEUED",
      progress: JSON.stringify({
        done: 0,
        total: parsed.data.accountIds.length,
        accountIds: parsed.data.accountIds,
      }),
    },
  });

  await ensureHandlersRegistered();
  const q = await queue();
  await q.enqueue("thumbnail-generation", { taskId: task.id });

  return NextResponse.json({ taskId: task.id }, { status: 202 });
}
