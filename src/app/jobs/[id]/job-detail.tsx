"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Check, Download, RotateCw, Archive, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, type RenditionStatus } from "@/components/status-badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { PLATFORM_LABEL, type Platform } from "@/lib/platforms";

type JobData = {
  id: string;
  status: string;
  baseCaption: string;
  baseThumbText: string;
  createdAt: string;
  completedAt: string | null;
  summary: {
    total: number;
    done: number;
    failed: number;
    pending: number;
    writing: number;
    rendering: number;
  };
  renditions: Array<{
    id: string;
    accountId: string;
    account: { id: string; handle: string; platform: string; displayName: string };
    status: string;
    caption: string | null;
    thumbText: string | null;
    errorMessage: string | null;
    attempts: number;
    startedAt: string | null;
    finishedAt: string | null;
    outputUrl: string | null;
    thumbnailUrl: string | null;
  }>;
};

const TERMINAL = new Set(["COMPLETED", "PARTIAL", "FAILED"]);

export function JobDetail({ initial }: { initial: JobData }) {
  const [job, setJob] = useState(initial);
  const [retrying, setRetrying] = useState<Set<string>>(new Set());
  const stopped = useRef(false);

  useEffect(() => {
    if (TERMINAL.has(job.status)) return;
    stopped.current = false;
    const iv = setInterval(async () => {
      if (stopped.current) return;
      try {
        const res = await fetch(`/api/jobs/${job.id}`, { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as JobData;
        setJob(next);
        if (TERMINAL.has(next.status)) {
          stopped.current = true;
          clearInterval(iv);
        }
      } catch {
        // network hiccup, next tick will retry
      }
    }, 3000);
    return () => {
      stopped.current = true;
      clearInterval(iv);
    };
  }, [job.id, job.status]);

  const percent = job.summary.total === 0 ? 0 : Math.round(((job.summary.done + job.summary.failed) / job.summary.total) * 100);
  const canDownloadZip = job.summary.done > 0;

  async function retryRendition(id: string) {
    setRetrying((s) => {
      const next = new Set(s);
      next.add(id);
      return next;
    });
    try {
      const res = await fetch(`/api/renditions/${id}/retry`, { method: "POST" });
      if (!res.ok) return;
      const refresh = await fetch(`/api/jobs/${job.id}`, { cache: "no-store" });
      if (refresh.ok) setJob(await refresh.json());
    } finally {
      setRetrying((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/jobs"
          className="inline-flex items-center gap-1 text-caption text-text-muted hover:text-text"
        >
          <ArrowLeft className="size-3" /> Riwayat job
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-display text-text">Job #{job.id.slice(-6)}</h1>
              <JobStatusBadge status={job.status} />
            </div>
            <p className="mt-1 text-body text-text-muted">
              {new Date(job.createdAt).toLocaleString("id-ID")}
              {job.completedAt ? ` · selesai ${new Date(job.completedAt).toLocaleString("id-ID")}` : ""}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="text-title text-text">
              {job.summary.done} / {job.summary.total} selesai
              {job.summary.failed > 0 ? (
                <span className="ml-2 text-danger">· {job.summary.failed} gagal</span>
              ) : null}
            </div>
            <Progress value={percent} className="w-56" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild disabled={!canDownloadZip} variant={canDownloadZip ? "primary" : "secondary"}>
            <a
              href={canDownloadZip ? `/api/jobs/${job.id}/download` : "#"}
              onClick={(e) => {
                if (!canDownloadZip) e.preventDefault();
              }}
            >
              <Archive className="size-4" />
              Unduh semua (.zip)
            </a>
          </Button>
          <span className="text-caption text-text-muted">
            {canDownloadZip
              ? `Berisi ${job.summary.done} MP4 + captions.txt`
              : "Tersedia setelah minimal 1 rendition selesai"}
          </span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {job.renditions.map((r) => (
          <RenditionCard
            key={r.id}
            r={r}
            retrying={retrying.has(r.id)}
            onRetry={() => retryRendition(r.id)}
          />
        ))}
      </div>

      <Card>
        <CardContent className="grid gap-3 py-4">
          <p className="text-label text-text-muted">Input asli</p>
          <div className="grid gap-1">
            <p className="text-caption text-text-muted">Caption</p>
            <p className="text-body text-text">{job.baseCaption}</p>
          </div>
          <div className="grid gap-1">
            <p className="text-caption text-text-muted">Thumbnail</p>
            <p className="text-body text-text">{job.baseThumbText}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function JobStatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: "muted" | "accent" | "success" | "warning" | "danger"; label: string }> = {
    QUEUED: { tone: "muted", label: "Antri" },
    PROCESSING: { tone: "accent", label: "Diproses" },
    COMPLETED: { tone: "success", label: "Selesai" },
    PARTIAL: { tone: "warning", label: "Sebagian" },
    FAILED: { tone: "danger", label: "Gagal" },
  };
  const m = map[status] ?? { tone: "muted" as const, label: status };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

function RenditionCard({
  r,
  retrying,
  onRetry,
}: {
  r: JobData["renditions"][number];
  retrying: boolean;
  onRetry: () => void;
}) {
  const platformLabel = PLATFORM_LABEL[r.account.platform as Platform] ?? r.account.platform;
  const showRetry = r.status === "FAILED" || r.status === "PENDING";

  return (
    <Card className={cn(r.status === "FAILED" && "border-danger")}>
      <CardContent className="grid gap-3 p-4">
        <div className="aspect-[9/16] w-full overflow-hidden rounded-md bg-surface-sunk">
          {r.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.thumbnailUrl} alt={r.account.handle} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-caption text-text-subtle">
              {r.status === "RENDERING" || r.status === "WRITING" ? "Sedang diproses…" : "Belum ada preview"}
            </div>
          )}
        </div>

        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-label text-text">{r.account.handle}</p>
            <p className="text-caption text-text-muted">{platformLabel}</p>
          </div>
          <StatusBadge status={r.status as RenditionStatus} />
        </div>

        {r.errorMessage ? (
          <div className="rounded-md bg-warning-bg p-2 text-caption text-warning">
            {r.errorMessage}
          </div>
        ) : null}

        {r.caption ? (
          <CopyBox label="Caption" text={r.caption} />
        ) : (
          <div className="grid gap-1">
            <p className="text-caption text-text-muted">Caption</p>
            <div className="min-h-16 rounded-md bg-surface-sunk p-2 text-caption text-text-subtle">
              {r.status === "PENDING" ? "Menunggu antrian…" : "Belum ditulis"}
            </div>
          </div>
        )}

        {r.thumbText ? (
          <div className="grid gap-1">
            <p className="text-caption text-text-muted">Teks thumbnail</p>
            <p className="rounded-md bg-surface-sunk px-2 py-1 font-mono text-caption text-text">
              {r.thumbText}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button asChild disabled={!r.outputUrl} variant={r.outputUrl ? "primary" : "secondary"} size="sm">
            <a
              href={r.outputUrl ?? "#"}
              download={`${r.account.handle.replace(/[^a-z0-9._-]+/gi, "_")}.mp4`}
              onClick={(e) => {
                if (!r.outputUrl) e.preventDefault();
              }}
            >
              <Download className="size-3" />
              Unduh MP4
            </a>
          </Button>
          {r.outputUrl ? (
            <Button asChild variant="ghost" size="sm">
              <a href={r.outputUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-3" />
                Preview
              </a>
            </Button>
          ) : null}
          {showRetry ? (
            <Button variant="ghost" size="sm" onClick={onRetry} disabled={retrying}>
              <RotateCw className={cn("size-3", retrying && "animate-spin")} />
              {retrying ? "Mengulang…" : "Coba lagi"}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function CopyBox({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between">
        <p className="text-caption text-text-muted">{label}</p>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 text-caption text-accent hover:text-accent-hover"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "Tersalin" : "Salin"}
        </button>
      </div>
      <p className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md bg-surface-sunk p-2 text-caption text-text">
        {text}
      </p>
    </div>
  );
}
