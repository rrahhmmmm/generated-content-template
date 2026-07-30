"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Status = "PENDING" | "ACTIVE" | "REJECTED";

export function UserActions({
  userId,
  name,
  status,
  isSelf,
}: {
  userId: string;
  name: string;
  status: Status;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "APPROVE" | "REJECT" | "DEACTIVATE") {
    if (busy) return;
    const label =
      action === "APPROVE"
        ? `Approve ${name}?`
        : action === "REJECT"
          ? `Reject ${name}? User tidak bisa login.`
          : `Deactivate ${name}? User akan langsung logout otomatis di request berikutnya.`;
    if (!confirm(label)) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(typeof body?.error === "string" ? body.error : "Gagal memproses");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {status === "PENDING" ? (
        <>
          <Button size="sm" onClick={() => run("APPROVE")} disabled={busy}>
            Approve
          </Button>
          <Button variant="danger" size="sm" onClick={() => run("REJECT")} disabled={busy}>
            Reject
          </Button>
        </>
      ) : null}
      {status === "ACTIVE" ? (
        <Button
          variant="danger"
          size="sm"
          onClick={() => run("DEACTIVATE")}
          disabled={busy || isSelf}
          title={isSelf ? "Tidak bisa deactivate akun sendiri" : undefined}
        >
          Deactivate
        </Button>
      ) : null}
      {status === "REJECTED" ? (
        <Button size="sm" onClick={() => run("APPROVE")} disabled={busy}>
          Aktifkan
        </Button>
      ) : null}
      {error ? <span className="text-caption text-danger">{error}</span> : null}
    </div>
  );
}
