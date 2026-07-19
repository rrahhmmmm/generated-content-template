"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PLATFORM_LABEL, type Platform } from "@/lib/platforms";

type Config = {
  systemPrompt: string;
  tiktokStyle: string;
  instagramStyle: string;
  youtubeStyle: string;
};

type Account = {
  id: string;
  handle: string;
  platform: string;
  displayName: string;
  promptStyle: string | null;
};

export function SettingsEditor({
  initialConfig,
  initialAccounts,
}: {
  initialConfig: Config;
  initialAccounts: Account[];
}) {
  const router = useRouter();
  const [config, setConfig] = useState(initialConfig);
  const [accounts, setAccounts] = useState(initialAccounts);
  const [dirty, setDirty] = useState<{ global: boolean; accounts: Set<string> }>({
    global: false,
    accounts: new Set(),
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const hasChanges = dirty.global || dirty.accounts.size > 0;

  const dirtyCount = useMemo(() => (dirty.global ? 1 : 0) + dirty.accounts.size, [dirty]);

  function updateGlobal(patch: Partial<Config>) {
    setConfig((c) => ({ ...c, ...patch }));
    setDirty((d) => ({ ...d, global: true }));
    setMessage(null);
  }

  function updateAccountStyle(id: string, value: string) {
    setAccounts((acc) => acc.map((a) => (a.id === id ? { ...a, promptStyle: value } : a)));
    setDirty((d) => {
      const next = new Set(d.accounts);
      next.add(id);
      return { ...d, accounts: next };
    });
    setMessage(null);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const errors: string[] = [];

      if (dirty.global) {
        const res = await fetch("/api/prompt-config", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(config),
        });
        if (!res.ok) errors.push(`Global: ${await res.text()}`);
      }

      for (const id of dirty.accounts) {
        const a = accounts.find((x) => x.id === id);
        if (!a) continue;
        const res = await fetch(`/api/accounts/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ promptStyle: a.promptStyle ?? "" }),
        });
        if (!res.ok) errors.push(`${a.handle}: ${await res.text()}`);
      }

      if (errors.length > 0) {
        setMessage({ tone: "danger", text: `Sebagian gagal disimpan: ${errors.join("; ")}` });
      } else {
        setMessage({ tone: "success", text: "Tersimpan." });
        setDirty({ global: false, accounts: new Set() });
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Aturan umum (system prompt)</CardTitle>
          <CardDescription>
            Instruksi dasar untuk LLM. Berlaku untuk semua job, semua akun. Sertakan aturan
            konten (jangan tambah klaim, jaga angka, dll) dan format output.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <Label htmlFor="system">System prompt</Label>
          <Textarea
            id="system"
            className="min-h-56 font-mono"
            value={config.systemPrompt}
            onChange={(e) => updateGlobal({ systemPrompt: e.target.value })}
          />
          <p className="text-caption text-text-muted">
            {config.systemPrompt.length} karakter
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gaya per platform</CardTitle>
          <CardDescription>
            Instruksi tambahan yang di-inject saat batch berisi akun dengan platform tsb.
            Kosongkan kalau tidak perlu diferensiasi.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <PlatformField
            platform="TIKTOK"
            value={config.tiktokStyle}
            onChange={(v) => updateGlobal({ tiktokStyle: v })}
            placeholder="Contoh: pakai hook di 3 detik pertama, gaya bahasa gen-Z, hashtag maksimal 3"
          />
          <PlatformField
            platform="INSTAGRAM"
            value={config.instagramStyle}
            onChange={(v) => updateGlobal({ instagramStyle: v })}
            placeholder="Contoh: caption boleh panjang, emoji di awal paragraf, hashtag ditaruh di akhir"
          />
          <PlatformField
            platform="YOUTUBE"
            value={config.youtubeStyle}
            onChange={(v) => updateGlobal({ youtubeStyle: v })}
            placeholder="Contoh: judul jelas + deskriptif, CTA subscribe di akhir caption"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Override per akun</CardTitle>
          <CardDescription>
            Instruksi khusus untuk satu akun (misal target audiens berbeda, gaya bahasa unik).
            Kalau diisi, akan menimpa gaya platform di atas untuk akun tsb.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {accounts.length === 0 ? (
            <p className="text-body text-text-muted">Belum ada akun. Buat dulu di /accounts.</p>
          ) : (
            accounts.map((a) => (
              <div key={a.id} className="grid gap-2 rounded-md border border-border p-4">
                <div className="flex items-center gap-2">
                  <span className="text-label text-text">{a.handle}</span>
                  <Badge tone="muted">{PLATFORM_LABEL[a.platform as Platform] ?? a.platform}</Badge>
                  <span className="text-caption text-text-muted">{a.displayName}</span>
                  {dirty.accounts.has(a.id) ? (
                    <Badge tone="warning" className="ml-auto">
                      belum tersimpan
                    </Badge>
                  ) : null}
                </div>
                <Textarea
                  className="min-h-20"
                  value={a.promptStyle ?? ""}
                  onChange={(e) => updateAccountStyle(a.id, e.target.value)}
                  placeholder="(kosong = ikuti gaya platform di atas)"
                />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="sticky bottom-4 flex items-center gap-3 rounded-md border border-border bg-surface p-3 shadow-sm">
        <Button onClick={save} disabled={!hasChanges || saving}>
          <Save className="size-4" />
          {saving ? "Menyimpan…" : `Simpan${dirtyCount > 0 ? ` (${dirtyCount} berubah)` : ""}`}
        </Button>
        {message ? (
          <span
            className={`text-caption ${message.tone === "success" ? "text-success" : "text-danger"}`}
          >
            {message.text}
          </span>
        ) : (
          <span className="text-caption text-text-muted">
            Perubahan berlaku untuk job berikutnya. Job yang sudah jalan tidak terpengaruh.
          </span>
        )}
      </div>
    </div>
  );
}

function PlatformField({
  platform,
  value,
  onChange,
  placeholder,
}: {
  platform: Platform;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{PLATFORM_LABEL[platform]}</Label>
      <Textarea
        className="min-h-20"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
