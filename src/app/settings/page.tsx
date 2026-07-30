import { prisma } from "@/lib/db";
import { loadPromptConfig } from "@/lib/prompt-config";
import { SettingsEditor } from "./settings-editor";
import { requireUserPage } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireUserPage("/settings");
  const [config, accounts] = await Promise.all([
    loadPromptConfig(),
    prisma.account.findMany({
      orderBy: { handle: "asc" },
      select: {
        id: true,
        handle: true,
        platform: true,
        displayName: true,
        promptStyle: true,
      },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-display text-text">Pengaturan</h1>
        <p className="mt-1 text-body text-text-muted">
          Konfigurasi prompt LLM: aturan umum, gaya per platform, dan override per akun.
        </p>
      </div>
      <SettingsEditor initialConfig={config} initialAccounts={accounts} />
    </div>
  );
}
