"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PLATFORM_LABEL, type Platform } from "@/lib/platforms";

type AccountOption = {
  id: string;
  handle: string;
  displayName: string;
  platform: string;
  isActive: boolean;
};

type Props =
  | {
      mode: "create";
      accounts: AccountOption[];
      compact?: boolean;
    }
  | {
      mode: "edit";
      accounts: AccountOption[];
      initial: { id: string; name: string; description: string | null; accountIds: string[] };
      compact?: boolean;
    };

export function GroupDialog(props: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(props.mode === "edit" ? props.initial.name : "");
  const [description, setDescription] = useState(
    props.mode === "edit" ? props.initial.description ?? "" : ""
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(props.mode === "edit" ? props.initial.accountIds : [])
  );
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return props.accounts;
    return props.accounts.filter(
      (a) =>
        a.handle.toLowerCase().includes(q) ||
        a.displayName.toLowerCase().includes(q) ||
        a.platform.toLowerCase().includes(q)
    );
  }, [props.accounts, query]);

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function reset() {
    if (props.mode === "create") {
      setName("");
      setDescription("");
      setSelected(new Set());
    } else {
      setName(props.initial.name);
      setDescription(props.initial.description ?? "");
      setSelected(new Set(props.initial.accountIds));
    }
    setQuery("");
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const url =
        props.mode === "create" ? "/api/groups" : `/api/groups/${props.initial.id}`;
      const method = props.mode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          accountIds: Array.from(selected),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg =
          typeof body?.error === "string" ? body.error : "Gagal menyimpan group.";
        setError(msg);
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        {props.mode === "create" ? (
          <Button size={props.compact ? "sm" : "md"}>
            <Plus className="size-4" />
            Tambah group
          </Button>
        ) : (
          <Button variant="ghost" size="sm">
            <Pencil className="size-4" />
            Edit
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {props.mode === "create" ? "Buat group baru" : `Edit group "${props.initial.name}"`}
            </DialogTitle>
            <DialogDescription>
              Nama unik. Centang akun yang menjadi anggota — akun bisa masuk banyak group.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="group-name">Nama</Label>
              <Input
                id="group-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Beauty Cluster"
                required
                autoFocus
                maxLength={80}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="group-description">Deskripsi (opsional)</Label>
              <Textarea
                id="group-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Contoh: semua akun untuk kampanye brand kecantikan."
                maxLength={500}
                rows={2}
              />
            </div>

            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label>Anggota</Label>
                <span className="text-caption text-text-muted">
                  {selected.size} dari {props.accounts.length} akun dipilih
                </span>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-subtle" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cari akun…"
                  className="pl-8"
                />
              </div>
              <div className="max-h-64 overflow-y-auto rounded-md border border-border bg-surface-sunk">
                {filtered.length === 0 ? (
                  <p className="px-3 py-4 text-caption text-text-muted">
                    Tidak ada akun cocok.
                  </p>
                ) : (
                  filtered.map((a) => (
                    <label
                      key={a.id}
                      className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 last:border-0 hover:bg-surface"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(a.id)}
                        onChange={() => toggle(a.id)}
                        className="size-4"
                      />
                      <div className="flex flex-1 flex-col">
                        <span className="text-body text-text">{a.handle}</span>
                        <span className="text-caption text-text-muted">{a.displayName}</span>
                      </div>
                      <Badge tone="muted">
                        {PLATFORM_LABEL[a.platform as Platform] ?? a.platform}
                      </Badge>
                      {!a.isActive ? <Badge tone="warning">Nonaktif</Badge> : null}
                    </label>
                  ))
                )}
              </div>
              <p className="text-caption text-text-muted">
                Akun nonaktif atau tanpa template boleh dicentang — validasi dilakukan saat submit job.
              </p>
            </div>

            {error ? <p className="text-caption text-danger">{error}</p> : null}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              type="button"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              Batal
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Menyimpan…" : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
