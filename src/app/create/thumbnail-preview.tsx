"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, RefreshCw, AlertTriangle, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { FileDropzone } from "@/components/file-dropzone";
import { PLATFORM_LABEL, type Platform } from "@/lib/platforms";

type AccountRow = {
  id: string;
  handle: string;
  platform: string;
  displayName: string;
};

export type ThumbnailEntry = {
  key: string;
  url: string;
  source: "AUTO" | "MANUAL";
  timestampSec?: number;
  adjusted?: boolean;
  similar?: boolean;
};

type GeneratedItem = {
  accountId: string;
  thumbnailKey: string;
  url: string;
  timestampSec: number;
  adjusted: boolean;
  similar: boolean;
  width: number;
  height: number;
};

type TaskResponse = {
  id: string;
  status: "QUEUED" | "RUNNING" | "DONE" | "FAILED";
  progress: { done: number; total: number };
  items: GeneratedItem[];
  warnings: string[];
  error: string | null;
};

type Props = {
  sourceKey: string | null;
  selectedAccounts: AccountRow[];
  thumbnails: Map<string, ThumbnailEntry>;
  onChange: (next: Map<string, ThumbnailEntry>) => void;
};

export function ThumbnailPreview({
  sourceKey,
  selectedAccounts,
  thumbnails,
  onChange,
}: Props) {
  const [taskStatus, setTaskStatus] = useState<TaskResponse["status"] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function startGenerate() {
    if (!sourceKey || selectedAccounts.length === 0) return;
    setError(null);
    setBusy(true);
    setWarnings([]);
    try {
      const res = await fetch("/api/thumbnails/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceKey,
          accountIds: selectedAccounts.map((a) => a.id),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body.error === "string" ? body.error : "Gagal mulai generate");
      }
      const data = (await res.json()) as { taskId: string };
      setTaskStatus("QUEUED");
      setProgress({ done: 0, total: selectedAccounts.length });
      startPolling(data.taskId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan");
      setBusy(false);
    }
  }

  function startPolling(id: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/thumbnails/generate/${id}`);
        if (!res.ok) throw new Error(`Poll gagal (${res.status})`);
        const data = (await res.json()) as TaskResponse;
        setTaskStatus(data.status);
        setProgress(data.progress);
        setWarnings(data.warnings ?? []);
        if (data.status === "DONE") {
          // Merge hasil ke state: kalau user sudah override MANUAL, jangan ditimpa
          const next = new Map(thumbnails);
          for (const item of data.items) {
            const existing = next.get(item.accountId);
            if (existing?.source === "MANUAL") continue;
            next.set(item.accountId, {
              key: item.thumbnailKey,
              url: item.url,
              source: "AUTO",
              timestampSec: item.timestampSec,
              adjusted: item.adjusted,
              similar: item.similar,
            });
          }
          onChange(next);
          stopPolling();
          setBusy(false);
        } else if (data.status === "FAILED") {
          setError(data.error ?? "Generate gagal");
          stopPolling();
          setBusy(false);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Poll gagal");
        stopPolling();
        setBusy(false);
      }
    }, 1000);
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function handleOverride(accountId: string, file: File): Promise<{ key: string; url: string }> {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/thumbnails/upload", { method: "POST", body: form });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(typeof body.error === "string" ? body.error : `Upload gagal (${res.status})`);
    }
    const data = (await res.json()) as { key: string; url: string };
    const next = new Map(thumbnails);
    next.set(accountId, {
      key: data.key,
      url: data.url,
      source: "MANUAL",
    });
    onChange(next);
    return data;
  }

  function clearThumbnail(accountId: string) {
    const next = new Map(thumbnails);
    next.delete(accountId);
    onChange(next);
  }

  const disabled = !sourceKey || selectedAccounts.length === 0;
  const isRunning = taskStatus === "QUEUED" || taskStatus === "RUNNING";
  const progressPct =
    progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>4. Thumbnail per akun (opsional)</CardTitle>
        <CardDescription>
          Generate thumbnail unik untuk tiap akun dari frame video yang berbeda. Boleh override
          manual per akun (drag & drop). Kalau tidak generate, akun akan pakai thumbnail default
          (frame detik 2 dari video hasil).
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={startGenerate}
            disabled={disabled || busy}
            variant={thumbnails.size > 0 ? "ghost" : "primary"}
          >
            {isRunning ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Generating…
              </>
            ) : thumbnails.size > 0 ? (
              <>
                <RefreshCw className="size-4" /> Regenerate
              </>
            ) : (
              <>
                <Sparkles className="size-4" /> Generate Thumbnails
              </>
            )}
          </Button>
          {isRunning ? (
            <div className="flex-1 min-w-40">
              <Progress value={progressPct} />
              <p className="mt-1 text-caption text-text-muted">
                {progress.done}/{progress.total} akun
              </p>
            </div>
          ) : (
            <span className="text-caption text-text-muted">
              {disabled
                ? "Upload video + pilih akun dulu."
                : thumbnails.size === 0
                  ? "Belum ada thumbnail. Klik untuk generate atau upload manual per akun."
                  : `${thumbnails.size}/${selectedAccounts.length} akun punya thumbnail.`}
            </span>
          )}
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger-bg p-2 text-caption text-danger">
            <AlertTriangle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {warnings.length > 0 ? (
          <div className="flex flex-col gap-1 rounded-md border border-warning/40 bg-warning-bg p-2 text-caption text-warning">
            {warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2">
                <AlertTriangle className="size-4 shrink-0" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {selectedAccounts.map((a) => {
            const entry = thumbnails.get(a.id);
            return (
              <div
                key={a.id}
                className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body text-text">{a.handle}</p>
                    <p className="truncate text-caption text-text-muted">{a.displayName}</p>
                  </div>
                  <Badge tone="muted">{PLATFORM_LABEL[a.platform as Platform] ?? a.platform}</Badge>
                </div>

                <FileDropzone
                  label={entry ? "Thumbnail" : "Belum ada thumbnail"}
                  hint="JPG/PNG, ≤5 MB"
                  accept={{ "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"] }}
                  maxSize={5 * 1024 * 1024}
                  value={entry ? { key: entry.key, url: entry.url, name: a.handle } : null}
                  onUpload={(f) => handleOverride(a.id, f)}
                  onClear={entry ? () => clearThumbnail(a.id) : undefined}
                  disabled={busy}
                />

                {entry ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={entry.source === "MANUAL" ? "accent" : "muted"}>
                      {entry.source === "MANUAL" ? (
                        <>
                          <Copy className="size-3" /> Manual
                        </>
                      ) : (
                        <>
                          <Sparkles className="size-3" /> Auto @{" "}
                          {entry.timestampSec?.toFixed(1)}s
                        </>
                      )}
                    </Badge>
                    {entry.adjusted ? (
                      <Badge tone="warning">Frame digeser (gelap)</Badge>
                    ) : null}
                    {entry.similar ? (
                      <Badge tone="warning">Mirip akun lain</Badge>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
