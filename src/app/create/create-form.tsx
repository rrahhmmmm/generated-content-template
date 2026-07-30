"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, X, Wand2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { PLATFORM_LABEL, PLATFORM_THUMB_MAX, type Platform } from "@/lib/platforms";
import { ThumbnailPreview, type ThumbnailEntry } from "./thumbnail-preview";

type AccountRow = {
  id: string;
  handle: string;
  platform: string;
  displayName: string;
  isActive: boolean;
  hasTemplate: boolean;
};

type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  accountIds: string[];
};

const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

const EXCLUDE_REASON_LABEL: Record<"INACTIVE" | "NO_TEMPLATE" | "NOT_FOUND", string> = {
  INACTIVE: "akun nonaktif",
  NO_TEMPLATE: "belum punya template",
  NOT_FOUND: "akun tidak ditemukan",
};

export function CreateForm({
  accounts,
  groups,
}: {
  accounts: AccountRow[];
  groups: GroupRow[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [thumbText, setThumbText] = useState("");
  const [sourceKey, setSourceKey] = useState<string | null>(null);
  const [sourceDuration, setSourceDuration] = useState<number | null>(null);
  const [thumbnails, setThumbnails] = useState<Map<string, ThumbnailEntry>>(new Map());

  // Default: semua akun aktif+template tercentang. Yang tanpa template disabled.
  const [selected, setSelected] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const a of accounts) if (a.isActive && a.hasTemplate) s.add(a.id);
    return s;
  });
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());

  const [submitResult, setSubmitResult] = useState<{
    jobId: string;
    excluded: Array<{
      accountId: string;
      username: string;
      reason: "INACTIVE" | "NO_TEMPLATE" | "NOT_FOUND";
    }>;
    missingGroups: string[];
  } | null>(null);

  // Union akun manual + akun via group terpilih. Untuk preview + validasi client.
  // Server tetap resolve ulang saat submit (source of truth).
  const resolvedAccountIds = useMemo(() => {
    const s = new Set<string>(selected);
    for (const gid of selectedGroups) {
      const g = groups.find((x) => x.id === gid);
      if (g) for (const aid of g.accountIds) s.add(aid);
    }
    return s;
  }, [selected, selectedGroups, groups]);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setVideoUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const minMaxChars = useMemo(() => {
    // Batas terkecil di antara akun terpilih (union group + manual) — kalau ada
    // TikTok 80 & YouTube 100 dan user pilih dua-duanya, tampilkan hint 80.
    let min = Infinity;
    for (const a of accounts) {
      if (!resolvedAccountIds.has(a.id)) continue;
      const m = PLATFORM_THUMB_MAX[a.platform as Platform] ?? 80;
      if (m < min) min = m;
    }
    return Number.isFinite(min) ? min : 80;
  }, [accounts, resolvedAccountIds]);

  const canSubmit =
    file !== null &&
    sourceKey !== null &&
    caption.trim().length > 0 &&
    thumbText.trim().length > 0 &&
    resolvedAccountIds.size > 0 &&
    !uploading &&
    submitResult === null;

  // Akun terpilih yang belum punya thumbnail pre-job → akan pakai fallback default.
  const missingThumbCount = Array.from(resolvedAccountIds).filter(
    (id) => !thumbnails.has(id)
  ).length;

  async function handleFilePick(f: File | null) {
    setError(null);
    setSourceKey(null);
    setSourceDuration(null);
    setThumbnails(new Map());
    if (!f) return setFile(null);
    if (f.size > MAX_VIDEO_BYTES) {
      setError(`Video terlalu besar. Maksimum ${MAX_VIDEO_BYTES / 1e6} MB.`);
      return;
    }
    if (!/^video\//.test(f.type)) {
      setError("File harus video (MP4/MOV/WebM).");
      return;
    }
    setFile(f);
    // Upload otomatis di background supaya sourceKey siap untuk thumbnail generator
    setUploading(true);
    setProgress(0);
    try {
      const result = await uploadWithProgress(f, (p) => setProgress(p));
      setSourceKey(result.key);
      setSourceDuration(result.duration ?? null);
      setProgress(100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload gagal");
      setFile(null);
    } finally {
      setUploading(false);
    }
  }

  function toggleAccount(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(id: string) {
    setSelectedGroups((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (!canSubmit || !sourceKey) return;
    setError(null);
    setUploading(true);
    setProgress(100);

    try {
      // Sertakan thumbnail untuk semua akun terpilih (union group + manual).
      // Server akan filter berdasarkan finalAccountIds hasil resolusi.
      const thumbnailPayload = Array.from(resolvedAccountIds)
        .map((accountId) => {
          const t = thumbnails.get(accountId);
          if (!t) return null;
          return {
            accountId,
            thumbnailKey: t.key,
            source: t.source,
            timestampSec: t.timestampSec,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceKey,
          sourceDuration,
          baseCaption: caption.trim(),
          baseThumbText: thumbText.trim(),
          // Kirim raw selection — server yang resolve union + dedup.
          groupIds: [...selectedGroups],
          accountIds: [...selected],
          thumbnails: thumbnailPayload.length > 0 ? thumbnailPayload : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body.error === "string" ? body.error : "Gagal membuat job");
      }
      const job = (await res.json()) as {
        id: string;
        finalAccountIds?: string[];
        excluded?: Array<{
          id: string;
          handle: string;
          reason: "INACTIVE" | "NO_TEMPLATE" | "NOT_FOUND";
        }>;
        missingGroups?: string[];
      };

      const excluded = (job.excluded ?? []).map((e) => ({
        accountId: e.id,
        username: e.handle,
        reason: e.reason,
      }));
      const missingGroups = job.missingGroups ?? [];

      if (excluded.length === 0 && missingGroups.length === 0) {
        router.push(`/jobs/${job.id}`);
        return;
      }

      // Ada akun / group yang di-drop server — tahan di halaman ini supaya user
      // sadar sebelum lanjut. Tombol submit di-disable via submitResult !== null.
      setSubmitResult({ jobId: job.id, excluded, missingGroups });
      setUploading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
      setUploading(false);
    }
  }

  const activeAccounts = accounts.filter((a) => a.isActive);
  const inactive = accounts.filter((a) => !a.isActive);

  return (
    <div className="flex flex-col gap-6">
      {/* Step 1: Video */}
      <Card>
        <CardHeader>
          <CardTitle>1. Video sumber</CardTitle>
          <CardDescription>MP4/MOV/WebM, maksimum 200 MB. Aspek rasio ideal 9:16.</CardDescription>
        </CardHeader>
        <CardContent>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/x-m4v"
            className="hidden"
            onChange={(e) => handleFilePick(e.target.files?.[0] ?? null)}
          />
          {file && videoUrl ? (
            <div className="grid gap-3 md:grid-cols-[220px_1fr]">
              <video
                src={videoUrl}
                className="aspect-[9/16] w-full max-w-[220px] rounded-md bg-black object-contain"
                controls
              />
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-body text-text">{file.name}</span>
                  <Badge tone="muted">{(file.size / 1e6).toFixed(2)} MB</Badge>
                </div>
                <p className="text-caption text-text-muted">
                  Tipe: {file.type || "unknown"}
                </p>
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFile(null);
                      setSourceKey(null);
                      setSourceDuration(null);
                      setThumbnails(new Map());
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    disabled={uploading}
                  >
                    <X className="size-3" /> Ganti video
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex min-h-40 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-surface-sunk px-4 py-6 hover:border-accent"
            >
              <UploadCloud className="size-6 text-text-subtle" />
              <p className="text-body text-text">Klik untuk pilih video</p>
              <p className="text-caption text-text-muted">atau seret file ke sini</p>
            </button>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Caption & Thumb */}
      <Card>
        <CardHeader>
          <CardTitle>2. Caption & teks thumbnail</CardTitle>
          <CardDescription>
            Versi asli — LLM akan menulis ulang per akun sesuai gaya platform dan override yang di-set di Pengaturan.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="caption">Caption</Label>
              <span className="text-caption text-text-muted">{caption.length} karakter</span>
            </div>
            <Textarea
              id="caption"
              className="min-h-32"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Contoh: Video baru masternya jenis cendet, harga 500 ribu, cocok untuk pemula. Follow untuk update harian!"
            />
          </div>
          <div className="grid gap-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="thumb">Teks thumbnail</Label>
              <span
                className={cn(
                  "text-caption",
                  thumbText.length > minMaxChars ? "text-warning" : "text-text-muted"
                )}
              >
                {thumbText.length} / {minMaxChars} karakter
              </span>
            </div>
            <Input
              id="thumb"
              value={thumbText}
              onChange={(e) => setThumbText(e.target.value)}
              placeholder="Contoh: CENDET BAKALAN GACOR HARGA 500 RIBU"
              maxLength={200}
            />
            {thumbText.length > minMaxChars ? (
              <p className="text-caption text-warning">
                Melewati batas akun terpendek — LLM akan memotong sesuai maxChars per akun.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Step 3a: Group (opsional) */}
      {groups.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>3a. Group (opsional)</CardTitle>
            <CardDescription>
              Pilih group untuk otomatis menyertakan semua anggotanya. Bisa dicampur dengan pemilihan akun manual di bawah.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {groups.map((g) => {
              const isChecked = selectedGroups.has(g.id);
              return (
                <label
                  key={g.id}
                  className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-3 hover:bg-surface-sunk"
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--accent)]"
                    checked={isChecked}
                    onChange={() => toggleGroup(g.id)}
                  />
                  <span className="text-body text-text">{g.name}</span>
                  <Badge tone="muted">{g.accountIds.length} akun</Badge>
                  {g.description ? (
                    <span className="text-caption text-text-muted">{g.description}</span>
                  ) : null}
                </label>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {/* Step 3: Akun */}
      <Card>
        <CardHeader>
          <CardTitle>3. Akun tujuan</CardTitle>
          <CardDescription>
            {resolvedAccountIds.size} akun akan menerima video (
            {selected.size} manual + {resolvedAccountIds.size - selected.size} via group).
            Akun tanpa template tidak bisa diproses.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {activeAccounts.length === 0 ? (
            <p className="text-body text-text-muted">Belum ada akun aktif. Buat dulu di /accounts.</p>
          ) : (
            activeAccounts.map((a) => {
              const disabled = !a.hasTemplate;
              const isManual = selected.has(a.id);
              const viaGroups = Array.from(selectedGroups)
                .map((gid) => groups.find((g) => g.id === gid))
                .filter((g): g is GroupRow => g != null && g.accountIds.includes(a.id));
              const coveredByGroup = viaGroups.length > 0;
              const isEffectivelySelected = isManual || coveredByGroup;
              return (
                <label
                  key={a.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-md border border-border p-3 hover:bg-surface-sunk",
                    disabled && "cursor-not-allowed opacity-60 hover:bg-transparent",
                    coveredByGroup && !isManual && "bg-surface-sunk"
                  )}
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--accent)]"
                    checked={isEffectivelySelected}
                    disabled={disabled || coveredByGroup}
                    onChange={() => toggleAccount(a.id)}
                  />
                  <span className="text-body text-text">{a.handle}</span>
                  <Badge tone="muted">{PLATFORM_LABEL[a.platform as Platform] ?? a.platform}</Badge>
                  <span className="text-caption text-text-muted">{a.displayName}</span>
                  {coveredByGroup ? (
                    <span className="ml-auto text-caption text-text-subtle">
                      via {viaGroups.map((g) => g.name).join(", ")}
                    </span>
                  ) : disabled ? (
                    <span className="ml-auto text-caption text-warning">Template belum diatur</span>
                  ) : null}
                </label>
              );
            })
          )}
          {inactive.length > 0 ? (
            <p className="text-caption text-text-muted">
              {inactive.length} akun nonaktif disembunyikan.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Step 4: Thumbnail preview (opsional, non-blocking) */}
      <ThumbnailPreview
        sourceKey={sourceKey}
        selectedAccounts={activeAccounts
          .filter((a) => resolvedAccountIds.has(a.id))
          .map((a) => ({
            id: a.id,
            handle: a.handle,
            platform: a.platform,
            displayName: a.displayName,
          }))}
        thumbnails={thumbnails}
        onChange={setThumbnails}
      />

      {/* Panel: excluded / missing groups warning */}
      {submitResult ? (
        <Card className="border-warning">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="size-4 text-warning" />
              Job dibuat, tapi ada akun yang tidak ikut
            </CardTitle>
            <CardDescription>
              Job {submitResult.jobId} sudah berjalan untuk akun yang valid. Detail berikut hanya info — tidak ada aksi yang perlu diambil.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {submitResult.excluded.length > 0 ? (
              <ul className="grid gap-1 rounded-md border border-border bg-surface-sunk p-3">
                {submitResult.excluded.map((e) => (
                  <li
                    key={e.accountId}
                    className="flex items-center gap-2 text-body text-text"
                  >
                    <span>{e.username}</span>
                    <Badge tone="warning">{EXCLUDE_REASON_LABEL[e.reason]}</Badge>
                  </li>
                ))}
              </ul>
            ) : null}
            {submitResult.missingGroups.length > 0 ? (
              <p className="text-caption text-text-muted">
                {submitResult.missingGroups.length} group tidak ditemukan (mungkin sudah dihapus).
              </p>
            ) : null}
            <div>
              <Button
                onClick={() => router.push(`/jobs/${submitResult.jobId}`)}
              >
                Lanjut ke job
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Submit bar */}
      <div className="sticky bottom-4 flex items-center gap-3 rounded-md border border-border bg-surface p-3 shadow-sm">
        <Button onClick={submit} disabled={!canSubmit}>
          <Wand2 className="size-4" />
          {uploading ? "Mengunggah…" : `Buat ${resolvedAccountIds.size} video`}
        </Button>
        {uploading ? (
          <div className="flex-1">
            <Progress value={progress} />
            <p className="mt-1 text-caption text-text-muted">
              {progress < 100 ? `Upload ${progress}%` : "Membuat job…"}
            </p>
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-caption text-danger">
            <AlertCircle className="size-3" />
            {error}
          </div>
        ) : (
          <span className="text-caption text-text-muted">
            {!file
              ? "Upload video dulu, lalu isi caption + thumbnail."
              : missingThumbCount > 0 && thumbnails.size > 0
                ? `Siap dikirim. ${missingThumbCount} akun akan pakai thumbnail default (frame detik 2 dari video hasil).`
                : missingThumbCount > 0
                  ? `Siap dikirim. Semua akun akan pakai thumbnail default (frame detik 2). Klik "Generate Thumbnails" untuk thumbnail unik per akun.`
                  : "Siap dikirim."}
          </span>
        )}
      </div>
    </div>
  );
}

function uploadWithProgress(
  file: File,
  onProgress: (p: number) => void
): Promise<{ key: string; url: string; duration?: number | null }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads/video");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Response tidak valid"));
        }
      } else {
        try {
          const body = JSON.parse(xhr.responseText);
          reject(new Error(body.error ?? `Upload gagal (${xhr.status})`));
        } catch {
          reject(new Error(`Upload gagal (${xhr.status})`));
        }
      }
    };
    xhr.onerror = () => reject(new Error("Network error saat upload"));
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}
