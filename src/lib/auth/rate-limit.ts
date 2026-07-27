// Sliding window rate limiter (in-memory) — cukup untuk single-instance Railway.
// Kalau multi-instance nanti, ganti ke Upstash Ratelimit tanpa mengubah call site.

const WINDOW_MS = 5 * 60 * 1000; // 5 menit
const MAX_ATTEMPTS = 5;

const attempts = new Map<string, number[]>();

export function checkLoginRateLimit(ip: string): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const arr = (attempts.get(ip) ?? []).filter((t) => t > cutoff);
  if (arr.length >= MAX_ATTEMPTS) {
    const earliest = arr[0];
    const retryAfter = Math.ceil((earliest + WINDOW_MS - now) / 1000);
    attempts.set(ip, arr);
    return { ok: false, retryAfter };
  }
  arr.push(now);
  attempts.set(ip, arr);

  // Prune growth secara opportunistic setiap 100 request
  if (attempts.size > 1000 && Math.random() < 0.01) pruneStale(cutoff);

  return { ok: true };
}

function pruneStale(cutoff: number) {
  for (const [ip, arr] of attempts) {
    const kept = arr.filter((t) => t > cutoff);
    if (kept.length === 0) attempts.delete(ip);
    else if (kept.length !== arr.length) attempts.set(ip, kept);
  }
}

export function extractIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
