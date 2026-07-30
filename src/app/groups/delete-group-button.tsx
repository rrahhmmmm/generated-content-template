"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function DeleteGroupButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch(`/api/groups/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Gagal menghapus group.");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Trash2 className="size-4" />
          Hapus
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hapus group &quot;{name}&quot;?</DialogTitle>
          <DialogDescription>
            Group akan dihapus. Akun-akun anggotanya tidak terpengaruh dan tetap ada di daftar akun.
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-caption text-danger">{error}</p> : null}
        <DialogFooter>
          <Button variant="ghost" type="button" onClick={() => setOpen(false)} disabled={deleting}>
            Batal
          </Button>
          <Button
            variant="danger"
            type="button"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "Menghapus…" : "Hapus"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
