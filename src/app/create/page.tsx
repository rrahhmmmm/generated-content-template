import { prisma } from "@/lib/db";
import { CreateForm } from "./create-form";

export const dynamic = "force-dynamic";

export default async function CreatePage() {
  const [accounts, groups] = await Promise.all([
    prisma.account.findMany({
      orderBy: { handle: "asc" },
      include: { template: { select: { id: true } } },
    }),
    prisma.group.findMany({
      orderBy: { name: "asc" },
      include: { accounts: { select: { id: true } } },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-display text-text">Buat konten</h1>
        <p className="mt-1 text-body text-text-muted">
          Satu video, satu caption, satu teks thumbnail — hasilnya {accounts.filter((a) => a.template && a.isActive).length} video
          untuk semua akun terpilih.
        </p>
      </div>
      <CreateForm
        accounts={accounts.map((a) => ({
          id: a.id,
          handle: a.handle,
          platform: a.platform,
          displayName: a.displayName,
          isActive: a.isActive,
          hasTemplate: Boolean(a.template),
        }))}
        groups={groups.map((g) => ({
          id: g.id,
          name: g.name,
          description: g.description,
          accountIds: g.accounts.map((a) => a.id),
        }))}
      />
    </div>
  );
}
