import Link from "next/link";
import { UsersRound } from "lucide-react";
import { prisma } from "@/lib/db";
import { PLATFORM_LABEL, type Platform } from "@/lib/platforms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { AddAccountDialog } from "./add-account-dialog";
import { requireUserPage } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  await requireUserPage("/accounts");
  const accounts = await prisma.account.findMany({
    orderBy: { createdAt: "desc" },
    include: { template: { select: { version: true, updatedAt: true } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-display text-text">Akun</h1>
          <p className="mt-1 text-body text-text-muted">
            Kelola akun sosial media dan template overlay masing-masing.
          </p>
        </div>
        <AddAccountDialog />
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="Belum ada akun"
          description="Tambahkan akun pertama untuk mulai membuat template overlay."
          action={<AddAccountDialog compact />}
        />
      ) : (
        <Card>
          <div className="overflow-hidden rounded-lg">
            <table className="w-full text-body">
              <thead className="border-b border-border bg-surface-sunk">
                <tr>
                  <Th>Handle</Th>
                  <Th>Platform</Th>
                  <Th>Template</Th>
                  <Th>Diperbarui</Th>
                  <Th className="w-24 text-right">Aksi</Th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0">
                    <Td>
                      <div className="flex flex-col">
                        <span className="text-text">{a.handle}</span>
                        <span className="text-caption text-text-muted">{a.displayName}</span>
                      </div>
                    </Td>
                    <Td>
                      <Badge tone="muted">{PLATFORM_LABEL[a.platform as Platform] ?? a.platform}</Badge>
                    </Td>
                    <Td>
                      {a.template ? (
                        <Badge tone="success">v{a.template.version}</Badge>
                      ) : (
                        <Badge tone="warning">Belum diatur</Badge>
                      )}
                    </Td>
                    <Td>
                      <span className="text-caption text-text-muted">
                        {a.template ? new Date(a.template.updatedAt).toLocaleString("id-ID") : "—"}
                      </span>
                    </Td>
                    <Td className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/accounts/${a.id}/template`}>
                          {a.template ? "Edit" : "Atur"}
                        </Link>
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
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
