"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FileDropzone } from "@/components/file-dropzone";
import { PreviewCanvas } from "@/components/template-editor/preview-canvas";
import { LayoutForm } from "./layout-form";
import { DEFAULT_LAYOUT, type IntroCard, type TemplateLayout } from "@/types/template-layout";

const SHORT_TEXT = "Halo dunia";
const LONG_TEXT =
  "Sebelumnya apresiasi Polri penangkapan Jampidsus oleh Densus 88 anti teror di Jakarta selatan hari ini pukul 08 pagi WIB";

function publicUrlFor(key: string | null): string | null {
  if (!key) return null;
  return `/api/uploads/local/${key.replace(/^\/+/, "")}`;
}

export function TemplateEditor({
  accountId,
  initialLayout,
  initialFrameKey,
  initialIntroKey,
}: {
  accountId: string;
  initialLayout: TemplateLayout;
  initialFrameKey: string | null;
  initialIntroKey: string | null;
}) {
  const router = useRouter();
  const [layout, setLayout] = useState<TemplateLayout>(initialLayout);
  const [frameKey, setFrameKey] = useState<string | null>(initialFrameKey);
  const [introKey, setIntroKey] = useState<string | null>(initialIntroKey);
  const [sampleText, setSampleText] = useState(LONG_TEXT);
  const [customText, setCustomText] = useState(LONG_TEXT);
  const [showIntro, setShowIntro] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const frameUrl = useMemo(() => publicUrlFor(frameKey), [frameKey]);
  const introUrl = useMemo(() => publicUrlFor(introKey), [introKey]);

  const canSave = Boolean(frameKey && layout.frame.overlayKey && (!layout.intro || (introKey && layout.intro.overlayKey)));

  async function uploadImage(file: File, prefix: string): Promise<{ key: string; url: string }> {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/uploads?prefix=${encodeURIComponent(prefix)}`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Upload gagal");
    }
    return res.json();
  }

  async function save() {
    setSaveError(null);
    setSaveMessage(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}/template`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ frameKey, introKey, layout }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { error?: string }));
        const msg =
          typeof body.error === "string" && body.error.length > 0
            ? body.error
            : `Gagal menyimpan template (${res.status})`;
        setSaveError(msg);
        return;
      }
      setSaveMessage("Template tersimpan.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex flex-col gap-6">
        <Card>
          <CardContent className="grid gap-4">
            <FileDropzone
              label="Frame (seluruh durasi)"
              hint="PNG 1080×1920 dengan area video transparan"
              value={
                frameUrl && frameKey
                  ? { key: frameKey, url: frameUrl, name: frameKey.split("/").pop() }
                  : null
              }
              onUpload={async (file) => {
                const up = await uploadImage(file, `templates/${accountId}/frame`);
                setFrameKey(up.key);
                setLayout((L) => ({ ...L, frame: { overlayKey: up.key } }));
                return up;
              }}
              onClear={() => {
                setFrameKey(null);
                setLayout((L) => ({ ...L, frame: { overlayKey: "" } }));
              }}
            />
            <FileDropzone
              label="Kartu intro (5 detik pertama)"
              hint="PNG 1080×1920 — kartu putih + garnish, tanpa teks thumbnail (kosongkan bila akun tanpa kartu)"
              value={
                introUrl && introKey
                  ? { key: introKey, url: introUrl, name: introKey.split("/").pop() }
                  : null
              }
              onUpload={async (file) => {
                const up = await uploadImage(file, `templates/${accountId}/intro`);
                setIntroKey(up.key);
                setLayout((L) => {
                  const base: IntroCard =
                    L.intro ?? initialLayout.intro ?? (DEFAULT_LAYOUT.intro as IntroCard);
                  return { ...L, intro: { ...base, overlayKey: up.key } };
                });
                return up;
              }}
              onClear={() => {
                setIntroKey(null);
                setLayout((L) => ({ ...L, intro: null }));
              }}
            />
          </CardContent>
        </Card>

        <LayoutForm layout={layout} onChange={setLayout} />

        <Card>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => { setSampleText(SHORT_TEXT); setCustomText(SHORT_TEXT); }}>
              Uji teks pendek
            </Button>
            <Button variant="secondary" onClick={() => { setSampleText(LONG_TEXT); setCustomText(LONG_TEXT); }}>
              Uji teks panjang
            </Button>
            <input
              type="text"
              value={customText}
              onChange={(e) => {
                setCustomText(e.target.value);
                setSampleText(e.target.value || " ");
              }}
              className="flex h-10 min-w-64 flex-1 rounded-md border border-border bg-surface px-3 text-body text-text focus:border-accent focus:outline-none"
              placeholder="Ketik teks uji…"
            />
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={!canSave || saving}>
            <Save className="size-4" />
            {saving ? "Menyimpan…" : "Simpan template"}
          </Button>
          {saveError ? <p className="text-caption text-danger">{saveError}</p> : null}
          {saveMessage ? <p className="text-caption text-success">{saveMessage}</p> : null}
          {!canSave ? (
            <p className="text-caption text-text-muted">
              Upload frame dulu (dan kartu intro jika akun pakai teks thumbnail).
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant={showIntro ? "primary" : "secondary"}
            size="sm"
            onClick={() => setShowIntro(true)}
          >
            Detik 2
          </Button>
          <Button
            variant={!showIntro ? "primary" : "secondary"}
            size="sm"
            onClick={() => setShowIntro(false)}
          >
            Detik 10
          </Button>
          <span className="text-caption text-text-muted">
            {showIntro ? "Kartu + teks tampil" : "Kartu & teks hilang"}
          </span>
        </div>
        <PreviewCanvas
          layout={layout}
          frameUrl={frameUrl}
          introUrl={introUrl}
          sampleText={sampleText}
          showIntro={showIntro}
        />
      </div>
    </div>
  );
}
