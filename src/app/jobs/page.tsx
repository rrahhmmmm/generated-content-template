import Link from "next/link";
import { History, Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";

export const dynamic = "force-dynamic";

const JOB_STATUS_MAP: Record<string, { tone: "muted" | "accent" | "success" | "warning" | "danger"; label: string }> = {
  QUEUED: { tone: "muted", label: "Antri" },
  PROCESSING: { tone: "accent", label: "Diproses" },
  COMPLETED: { tone: "success", label: "Selesai" },
  PARTIAL: { tone: "warning", label: "Sebagian" },
  FAILED: { tone: "danger", label: "Gagal" },
};

export default async function JobsPage() {
  const jobs = await prisma.job.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      renditions: {
        select: {
          status: true,
          thumbnailKey: true,
        },
      },
    },
  });
  const s = storage();

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-display text-text">Riwayat</h1>
          <p className="mt-1 text-body text-text-muted">Semua job yang pernah dibuat.</p>
        </div>
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
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-display text-text">Riwayat</h1>
          <p className="mt-1 text-body text-text-muted">
            50 job terbaru. Klik untuk lihat detail per akun.
          </p>
        </div>
        <Button asChild>
          <Link href="/create">
            <Plus className="size-4" /> Buat baru
          </Link>
        </Button>
      </div>

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
                const statusMeta = JOB_STATUS_MAP[j.status] ?? { tone: "muted" as const, label: j.status };

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
                        <p className="line-clamp-2 text-body text-text">{j.baseCaption}</p>
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
                          {new Date(j.createdAt).toLocaleString("id-ID")}
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
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-3 text-left text-label text-text-muted ${className ?? ""}`}>{children}</th>
  );
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-middle ${className ?? ""}`}>{children}</td>;
}
