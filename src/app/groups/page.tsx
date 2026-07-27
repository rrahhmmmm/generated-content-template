import { Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { GroupDialog } from "./group-dialog";
import { DeleteGroupButton } from "./delete-group-button";
import { requireUserPage } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  await requireUserPage("/groups");
  const [groups, accounts] = await Promise.all([
    prisma.group.findMany({
      orderBy: { name: "asc" },
      include: {
        accounts: {
          select: { id: true, handle: true, platform: true, isActive: true },
          orderBy: { handle: "asc" },
        },
      },
    }),
    prisma.account.findMany({
      orderBy: { handle: "asc" },
      select: { id: true, handle: true, displayName: true, platform: true, isActive: true },
    }),
  ]);

  const accountOptions = accounts.map((a) => ({
    id: a.id,
    handle: a.handle,
    displayName: a.displayName,
    platform: a.platform,
    isActive: a.isActive,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-display text-text">Group</h1>
          <p className="mt-1 text-body text-text-muted">
            Kumpulan akun untuk mempercepat pemilihan di halaman Buat. Satu akun bisa masuk beberapa group.
          </p>
        </div>
        <GroupDialog mode="create" accounts={accountOptions} />
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Belum ada group"
          description="Buat group untuk mengelompokkan akun yang sering dipilih bersamaan."
          action={<GroupDialog mode="create" accounts={accountOptions} compact />}
        />
      ) : (
        <Card>
          <div className="overflow-hidden rounded-lg">
            <table className="w-full text-body">
              <thead className="border-b border-border bg-surface-sunk">
                <tr>
                  <Th>Nama</Th>
                  <Th>Deskripsi</Th>
                  <Th>Anggota</Th>
                  <Th className="w-40 text-right">Aksi</Th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.id} className="border-b border-border last:border-0">
                    <Td>
                      <span className="text-text">{g.name}</span>
                    </Td>
                    <Td>
                      <span className="text-caption text-text-muted">
                        {g.description || "—"}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        <span className="text-caption text-text-muted">
                          {g.accounts.length} akun
                        </span>
                        {g.accounts.slice(0, 3).map((a) => (
                          <span key={a.id} className="text-caption text-text-subtle">
                            · {a.handle}
                          </span>
                        ))}
                        {g.accounts.length > 3 ? (
                          <span className="text-caption text-text-subtle">
                            +{g.accounts.length - 3} lain
                          </span>
                        ) : null}
                      </div>
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-2">
                        <GroupDialog
                          mode="edit"
                          accounts={accountOptions}
                          initial={{
                            id: g.id,
                            name: g.name,
                            description: g.description,
                            accountIds: g.accounts.map((a) => a.id),
                          }}
                        />
                        <DeleteGroupButton id={g.id} name={g.name} />
                      </div>
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
    <th className={`px-4 py-3 text-left text-label text-text-muted ${className ?? ""}`}>
      {children}
    </th>
  );
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-middle ${className ?? ""}`}>{children}</td>;
}
