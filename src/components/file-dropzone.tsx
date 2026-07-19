"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Props = {
  label: string;
  hint?: string;
  accept?: Record<string, string[]>;
  maxSize?: number;
  value?: { key: string; url: string; name?: string } | null;
  onUpload: (file: File) => Promise<{ key: string; url: string }>;
  onClear?: () => void;
  disabled?: boolean;
};

export function FileDropzone({
  label,
  hint,
  accept = { "image/png": [".png"] },
  maxSize = 20 * 1024 * 1024,
  value,
  onUpload,
  onClear,
  disabled,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      setBusy(true);
      setError(null);
      try {
        await onUpload(file);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload gagal");
      } finally {
        setBusy(false);
      }
    },
    [onUpload]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    accept,
    maxSize,
    multiple: false,
    onDrop,
    disabled: disabled || busy,
  });

  const hasValue = Boolean(value?.url);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-label text-text">{label}</span>
        {hasValue && onClear ? (
          <Button variant="ghost" size="sm" onClick={onClear} type="button" disabled={busy}>
            <X className="size-3" />
            Hapus
          </Button>
        ) : null}
      </div>
      <div
        {...getRootProps()}
        className={cn(
          "relative flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-border bg-surface-sunk px-4 py-6 transition-colors",
          isDragActive && "border-accent bg-accent-bg",
          isDragReject && "border-danger bg-danger-bg",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <input {...getInputProps()} />
        {hasValue ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value!.url}
            alt={value!.name ?? label}
            className="max-h-40 object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-center">
            <UploadCloud className="size-6 text-text-subtle" />
            <p className="text-body text-text">
              {busy ? "Mengunggah…" : isDragActive ? "Lepaskan di sini" : "Seret PNG atau klik untuk pilih"}
            </p>
            {hint ? <p className="text-caption text-text-muted">{hint}</p> : null}
          </div>
        )}
      </div>
      {error ? <p className="text-caption text-danger">{error}</p> : null}
    </div>
  );
}
