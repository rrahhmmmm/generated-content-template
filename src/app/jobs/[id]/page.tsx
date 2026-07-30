import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { JobDetail } from "./job-detail";
import { requireUserPage } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireUserPage(`/jobs/${id}`);
  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      renditions: {
        include: {
          account: { select: { id: true, handle: true, platform: true, displayName: true } },
        },
        orderBy: { account: { handle: "asc" } },
      },
    },
  });
  if (!job) notFound();

  const s = storage();
  const initial = {
    id: job.id,
    status: job.status,
    baseCaption: job.baseCaption,
    baseThumbText: job.baseThumbText,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
    summary: {
      total: job.renditions.length,
      done: job.renditions.filter((r) => r.status === "DONE").length,
      failed: job.renditions.filter((r) => r.status === "FAILED").length,
      pending: job.renditions.filter((r) => r.status === "PENDING").length,
      writing: job.renditions.filter((r) => r.status === "WRITING").length,
      rendering: job.renditions.filter((r) => r.status === "RENDERING").length,
    },
    renditions: job.renditions.map((r) => ({
      id: r.id,
      accountId: r.accountId,
      account: r.account,
      status: r.status,
      caption: r.caption,
      thumbText: r.thumbText,
      errorMessage: r.errorMessage,
      attempts: r.attempts,
      startedAt: r.startedAt?.toISOString() ?? null,
      finishedAt: r.finishedAt?.toISOString() ?? null,
      outputUrl: r.outputKey ? s.getPublicUrl(r.outputKey) : null,
      thumbnailUrl: r.thumbnailKey ? s.getPublicUrl(r.thumbnailKey) : null,
    })),
  };

  return <JobDetail initial={initial} />;
}
