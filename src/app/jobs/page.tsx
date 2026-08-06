import Link from "next/link";
import { History, Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { requireUserPage } from "@/lib/auth/session";
import { getGroups } from "@/lib/groups";
import { formatDateTime, parseDayEnd, parseDayStart } from "@/lib/time";
import { HistoryFilters } from "@/components/jobs/history-filters";

export const dynamic = "force-dynamic";

const JOB_STATUS_MAP: Record<string, { tone: "muted" | "accent" | "success" | "warning" | "danger"; label: string }> = {
  QUEUED: { tone: "muted", label: "Antri" },
  PROCESSING: { tone: "accent", label: "Diproses" },
  COMPLETED: { tone: "success", label: "Selesai" },
  PARTIAL: { tone: "warning", label: "Sebagian" },
  FAILED: { tone: "danger", label: "Gagal" },
};

const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

type SearchParams = { group?: string; from?: string; to?: string };

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireUserPage("/jobs");

  const sp = (await searchParams) ?? {};
  const rawGroup = typeof sp.group === "string" && sp.group.length > 0 ? sp.group : undefined;
  const rawFrom = typeof sp.from === "string" && sp.from.length > 0 ? sp.from : undefined;
  const rawTo = typeof sp.to === "string" && sp.to.length > 0 ? sp.to : undefined;

  let from = parseDayStart(rawFrom);
  let to = parseDayEnd(rawTo);
  let normalizedFrom = rawFrom;
  let normalizedTo = rawTo;

  if (from && to && from > to) {
    [from, to] = [parseDayStart(rawTo), parseDayEnd(rawFrom)];
    [normalizedFrom, normalizedTo] = [rawTo, rawFrom];
  }
  if (from && to && to.getTime() - from.getTime() > MAX_RANGE_MS) {
    from = new Date(to.getTime() - MAX_RANGE_MS);
  }

  const groups = await getGroups();
  const groupId = rawGroup && groups.some((g) => g.id === rawGroup) ? rawGroup : undefined;

  const filters = {
    group: groupId,
    from: normalizedFrom,
    to: normalizedTo,
  };
  const hasActiveFilter = Boolean(filters.group || filters.from || filters.to);

  let accountIds: string[] | undefined;
  if (groupId) {
    const accs = await prisma.account.findMany({
      where: { groups: { some: { id: groupId } } },
      select: { id: true },
    });
    accountIds = accs.map((a) => a.id);
  }

  let jobs: Awaited<ReturnType<typeof fetchJobs>> = [];
  if (!accountIds || accountIds.length > 0) {
    const where: Prisma.JobWhereInput = {};
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }
    if (accountIds) {
      where.renditions = { some: { accountId: { in: accountIds } } };
    }
    jobs = await fetchJobs(where);
  }

  const s = storage();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-display text-text">Riwayat</h1>
          <p className="mt-1 text-body text-text-muted">
            {hasActiveFilter
              ? `${jobs.length} job cocok filter (maks 50).`
              : "50 job terbaru. Klik untuk lihat detail per akun."}
          </p>
        </div>
        <Button asChild>
          <Link href="/create">
            <Plus className="size-4" /> Buat baru
          </Link>
        </Button>
      </div>

      <HistoryFilters groups={groups} filters={filters} />

      {jobs.length === 0 ? (
        hasActiveFilter ? (
          <EmptyState
            icon={History}
            title="Tidak ada job yang cocok"
            description="Coba longgarkan filter atau reset ke tampilan default."
            action={
              <Button variant="secondary" size="sm" asChild>
                <Link href="/jobs">Reset filter</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={History}
            title="Belum ada job"
            description="Buat konten pertama untuk melihat riwayatnya di sini."
            action={
              <Button size="sm" asChild>
                <Link href="/create">
                  <Plus className="size-3" /> Buat konten
                </Link>
              </Button>
            }
          />
        )
      ) : (
        <Card>
          <div className="overflow-hidden rounded-lg">
            <table className="w-full text-body">
              <thead className="border-b border-border bg-surface-sunk">
                <tr>
                  <Th>Preview</Th>
                  <Th>Caption asli</Th>
                  <Th>Status</Th>
                  <Th>Progress</Th>
                  <Th>Waktu</Th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => {
                  const total = j.renditions.length;
                  const done = j.renditions.filter((r) => r.status === "DONE").length;
                  const failed = j.renditions.filter((r) => r.status === "FAILED").length;
                  const thumb = j.renditions.find((r) => r.thumbnailKey);
                  const statusMeta =
                    JOB_STATUS_MAP[j.status] ?? { tone: "muted" as const, label: j.status };

                  return (
                    <tr
                      key={j.id}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-sunk"
                    >
                      <Td>
                        <Link href={`/jobs/${j.id}`} className="block">
                          {thumb?.thumbnailKey ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={s.getPublicUrl(thumb.thumbnailKey)}
                              alt=""
                              className="h-16 w-9 rounded object-cover"
                            />
                          ) : (
                            <div className="h-16 w-9 rounded bg-surface-sunk" />
                          )}
                        </Link>
                      </Td>
                      <Td className="max-w-md">
                        <Link href={`/jobs/${j.id}`} className="block">
                          <p className="line-clamp-2 text-body text-text">
                            {j.description ?? j.baseCaption ?? "(tanpa input teks)"}
                          </p>
                          <p className="mt-1 text-caption text-text-muted">
                            #{j.id.slice(-6)}
                          </p>
                        </Link>
                      </Td>
                      <Td>
                        <Link href={`/jobs/${j.id}`}>
                          <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                        </Link>
                      </Td>
                      <Td>
                        <Link href={`/jobs/${j.id}`}>
                          <span className="text-body text-text">
                            {done} / {total}
                          </span>
                          {failed > 0 ? (
                            <span className="ml-2 text-caption text-danger">· {failed} gagal</span>
                          ) : null}
                        </Link>
                      </Td>
                      <Td>
                        <Link href={`/jobs/${j.id}`}>
                          <span className="text-caption text-text-muted">
                            {formatDateTime(new Date(j.createdAt))}
                          </span>
                        </Link>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function fetchJobs(where: Prisma.JobWhereInput) {
  return prisma.job.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      status: true,
      description: true,
      baseCaption: true,
      createdAt: true,
      renditions: { select: { status: true, thumbnailKey: true } },
    },
  });
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-3 text-left text-label text-text-muted ${className ?? ""}`}>{children}</th>
  );
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-middle ${className ?? ""}`}>{children}</td>;
}
