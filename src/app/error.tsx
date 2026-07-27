"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h2 className="text-title text-text">Terjadi kesalahan</h2>
      <p className="max-w-md text-body text-text-muted">
        {error.message || "Silakan coba lagi. Kalau berulang, hubungi admin."}
      </p>
      <button
        onClick={reset}
        className="rounded-md bg-accent px-4 py-2 text-body text-accent-fg hover:bg-accent-hover"
      >
        Coba lagi
      </button>
    </div>
  );
}
