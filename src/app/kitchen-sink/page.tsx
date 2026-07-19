"use client";

import { useState } from "react";
import { AlertCircle, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge, type RenditionStatus } from "@/components/status-badge";
import { FileDropzone } from "@/components/file-dropzone";

const STATUSES: RenditionStatus[] = ["PENDING", "WRITING", "RENDERING", "DONE", "FAILED"];

export default function KitchenSinkPage() {
  const [progress, setProgress] = useState(45);
  const [dropzoneValue, setDropzoneValue] = useState<{ key: string; url: string } | null>(null);

  return (
    <div className="flex flex-col gap-12">
      <div>
        <h1 className="text-display text-text">Kitchen Sink</h1>
        <p className="mt-1 text-body text-text-muted">
          Semua komponen dasar dalam berbagai state. Toggle tema di header untuk memverifikasi dark mode.
        </p>
      </div>

      <Section title="Type scale">
        <p className="text-display">Display 28 / 34</p>
        <p className="text-title">Title 20 / 28</p>
        <p className="text-body">Body 15 / 24</p>
        <p className="text-label">Label 13 / 18</p>
        <p className="text-caption">Caption 12 / 16</p>
      </Section>

      <Section title="Warna surface">
        <div className="grid grid-cols-4 gap-4">
          <Swatch className="bg-bg text-text" label="bg" />
          <Swatch className="bg-surface text-text border" label="surface" />
          <Swatch className="bg-surface-sunk text-text" label="surface-sunk" />
          <Swatch className="bg-accent text-accent-fg" label="accent" />
          <Swatch className="bg-accent-bg text-accent" label="accent-bg" />
          <Swatch className="bg-success text-white" label="success" />
          <Swatch className="bg-warning text-white" label="warning" />
          <Swatch className="bg-danger text-white" label="danger" />
        </div>
      </Section>

      <Section title="Button">
        <div className="flex flex-wrap gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
        </div>
      </Section>

      <Section title="Form">
        <div className="grid max-w-md gap-4">
          <div className="grid gap-2">
            <Label htmlFor="handle">Handle</Label>
            <Input id="handle" placeholder="@brand.jakarta" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="platform">Platform</Label>
            <Select>
              <SelectTrigger id="platform">
                <SelectValue placeholder="Pilih platform" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TIKTOK">TikTok</SelectItem>
                <SelectItem value="INSTAGRAM">Instagram</SelectItem>
                <SelectItem value="YOUTUBE">YouTube</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="caption">Caption</Label>
            <Textarea id="caption" placeholder="Tulis caption utama…" />
          </div>
        </div>
      </Section>

      <Section title="Badge & Status">
        <div className="flex flex-wrap gap-2">
          <Badge tone="muted">muted</Badge>
          <Badge tone="accent">accent</Badge>
          <Badge tone="success">success</Badge>
          <Badge tone="warning">warning</Badge>
          <Badge tone="danger">danger</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
        </div>
      </Section>

      <Section title="Card">
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>@kicauonline</CardTitle>
              <CardDescription>TikTok · Template v2</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-body text-text-muted">
                Card standar dengan header, konten, dan footer. Radius mengikuti token `--radius-lg`.
              </p>
            </CardContent>
            <CardFooter>
              <Button size="sm">Aksi utama</Button>
              <Button size="sm" variant="ghost">
                Batal
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Progress render</CardTitle>
              <CardDescription>7 dari 10 rendition selesai</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Progress value={progress} />
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setProgress((p) => Math.max(0, p - 10))}>
                  -10%
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setProgress((p) => Math.min(100, p + 10))}>
                  +10%
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="Dialog">
        <Dialog>
          <DialogTrigger asChild>
            <Button>Buka dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tambah akun baru</DialogTitle>
              <DialogDescription>Isi handle dan platform untuk membuat akun.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-4">
              <Input placeholder="@handle" />
              <Input placeholder="Nama tampilan" />
            </div>
            <DialogFooter>
              <Button variant="ghost">Batal</Button>
              <Button>Simpan</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Section>

      <Section title="Skeleton">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-32 w-full" />
        </div>
      </Section>

      <Section title="Empty state">
        <EmptyState
          icon={Inbox}
          title="Belum ada akun"
          description="Tambahkan akun pertama untuk mulai membuat template overlay."
          action={<Button size="sm">Tambah akun</Button>}
        />
      </Section>

      <Section title="File dropzone">
        <div className="max-w-md">
          <FileDropzone
            label="Frame (seluruh durasi)"
            hint="PNG 1080×1920, transparan di area video"
            value={dropzoneValue}
            onUpload={async (file) => {
              // demo — tidak upload nyata
              const url = URL.createObjectURL(file);
              const v = { key: `demo/${file.name}`, url };
              setDropzoneValue(v);
              return v;
            }}
            onClear={() => setDropzoneValue(null)}
          />
        </div>
      </Section>

      <Section title="Callout">
        <div className="flex items-start gap-3 rounded-md border border-warning bg-warning-bg p-4 text-warning">
          <AlertCircle className="mt-0.5 size-4" />
          <div className="flex-1 text-body">
            Aspek rasio klip berbeda dari template — sisi akan dipotong saat render.
          </div>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-6">
      <h2 className="text-title text-text">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Swatch({ className, label }: { className?: string; label: string }) {
  return (
    <div className={`flex h-16 items-center justify-center rounded-md ${className}`}>
      <span className="text-caption font-medium">{label}</span>
    </div>
  );
}
