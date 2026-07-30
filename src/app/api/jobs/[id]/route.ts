import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { assertUser } from "@/lib/auth/session";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await assertUser();
  if (gate) return gate;
  const { id } = await ctx.params;
  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      renditions: {
        include: { account: { select: { id: true, handle: true, platform: true, displayName: true } } },
        orderBy: { account: { handle: "asc" } },
      },
    },
  });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const summary = {
    total: job.renditions.length,
    done: job.renditions.filter((r) => r.status === "DONE").length,
    failed: job.renditions.filter((r) => r.status === "FAILED").length,
    pending: job.renditions.filter((r) => r.status === "PENDING").length,
    writing: job.renditions.filter((r) => r.status === "WRITING").length,
    rendering: job.renditions.filter((r) => r.status === "RENDERING").length,
  };

  const s = storage();
  const renditions = job.renditions.map((r) => ({
    id: r.id,
    accountId: r.accountId,
    account: r.account,
    status: r.status,
    caption: r.caption,
    thumbText: r.thumbText,
    errorMessage: r.errorMessage,
    attempts: r.attempts,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    outputUrl: r.outputKey ? s.getPublicUrl(r.outputKey) : null,
    thumbnailUrl: r.thumbnailKey ? s.getPublicUrl(r.thumbnailKey) : null,
  }));

  return NextResponse.json({
    id: job.id,
    status: job.status,
    baseCaption: job.baseCaption,
    baseThumbText: job.baseThumbText,
    sourceKey: job.sourceKey,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    summary,
    renditions,
  });
}
