import { UsersRound } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth/session";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { UserActions } from "./user-actions";

export const dynamic = "force-dynamic";

const STATUS_TONE = {
  PENDING: "warning",
  ACTIVE: "success",
  REJECTED: "danger",
} as const;

const STATUS_LABEL = {
  PENDING: "Menunggu approval",
  ACTIVE: "Aktif",
  REJECTED: "Ditolak",
} as const;

export default async function AdminUsersPage() {
  const session = await requireAdminPage("/admin/users");
  const users = await prisma.user.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      createdAt: true,
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-display text-text">Manajemen User</h1>
        <p className="mt-1 text-body text-text-muted">
          Approve, reject, atau deactivate user. User baru dari register otomatis masuk status &quot;Menunggu approval&quot;.
        </p>
      </div>

      {users.length === 0 ? (
        <EmptyState icon={UsersRound} title="Belum ada user" />
      ) : (
        <Card>
          <div className="overflow-hidden rounded-lg">
            <table className="w-full text-body">
              <thead className="border-b border-border bg-surface-sunk">
                <tr>
                  <Th>Nama</Th>
                  <Th>Email</Th>
                  <Th>Role</Th>
                  <Th>Status</Th>
                  <Th>Terdaftar</Th>
                  <Th className="w-56 text-right">Aksi</Th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const status = u.status as keyof typeof STATUS_TONE;
                  const isSelf = session.userId === u.id;
                  return (
                    <tr key={u.id} className="border-b border-border last:border-0">
                      <Td>
                        <span className="text-text">{u.name}</span>
                        {isSelf ? (
                          <span className="ml-2 text-caption text-text-subtle">(Anda)</span>
                        ) : null}
                      </Td>
                      <Td>
                        <span className="text-caption text-text-muted">{u.email}</span>
                      </Td>
                      <Td>
                        <Badge tone={u.role === "ADMIN" ? "success" : "muted"}>{u.role}</Badge>
                      </Td>
                      <Td>
                        <Badge tone={STATUS_TONE[status] ?? "muted"}>
                          {STATUS_LABEL[status] ?? status}
                        </Badge>
                      </Td>
                      <Td>
                        <span className="text-caption text-text-muted">
                          {new Date(u.createdAt).toLocaleString("id-ID")}
                        </span>
                      </Td>
                      <Td className="text-right">
                        <UserActions
                          userId={u.id}
                          name={u.name}
                          status={status}
                          isSelf={isSelf}
                        />
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
