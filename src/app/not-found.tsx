import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h2 className="text-title text-text">404 — Halaman tidak ditemukan</h2>
      <p className="text-body text-text-muted">
        Halaman yang Anda cari tidak ada atau sudah dipindahkan.
      </p>
      <Link href="/" className="text-body text-accent hover:underline">
        Kembali ke beranda
      </Link>
    </div>
  );
}
