// Next.js instrumentation hook — dijalankan sekali per proses saat boot.
// Kita pakai untuk mendaftarkan handler in-process queue supaya POST /api/jobs
// bisa langsung enqueue tanpa registrasi ad-hoc.
//
// Hanya register kalau JOB_QUEUE=memory. Untuk BullMQ, worker script yang
// register handler — bukan Next.js.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if ((process.env.JOB_QUEUE ?? "memory") !== "memory") return;
  const { ensureHandlersRegistered } = await import("@/lib/queue");
  await ensureHandlersRegistered();
  console.log("[instrumentation] in-process queue handlers terdaftar");
}
