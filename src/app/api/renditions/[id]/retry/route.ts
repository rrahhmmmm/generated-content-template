import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { queue, ensureHandlersRegistered } from "@/lib/queue";
import { assertUser } from "@/lib/auth/session";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await assertUser();
  if (gate) return gate;
  const { id } = await ctx.params;
  const rendition = await prisma.rendition.findUnique({ where: { id } });
  if (!rendition) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (rendition.status === "DONE") {
    return NextResponse.json({ error: "Rendition sudah selesai" }, { status: 409 });
  }

  await prisma.rendition.update({
    where: { id },
    data: { status: "PENDING", errorMessage: null },
  });
  // Kalau caption belum ada, panggil job-prep. Kalau sudah ada, langsung render.
  await ensureHandlersRegistered();
  const q = await queue();
  if (!rendition.caption || !rendition.thumbText) {
    await q.enqueue("job-prep", { jobId: rendition.jobId });
  } else {
    await q.enqueue("render-rendition", { renditionId: id });
  }
  return NextResponse.json({ ok: true });
}
