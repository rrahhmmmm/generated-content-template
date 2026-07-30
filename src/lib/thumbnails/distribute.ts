/**
 * Bagi merata N timestamp sepanjang duration.
 * Kalau (count-1)*minIntervalSec > duration, clamp ke [0, duration] dan
 * push warning — beberapa timestamp bisa overlap (di-handle dedup di layer lain).
 */
export function distributeTimestamps(
  duration: number,
  count: number,
  minIntervalSec = 0.3
): { timestamps: number[]; warnings: string[] } {
  const warnings: string[] = [];

  if (count <= 0) return { timestamps: [], warnings };
  if (duration <= 0) {
    warnings.push("Durasi video tidak valid — semua timestamp jatuh di 0.");
    return { timestamps: Array(count).fill(0), warnings };
  }

  const naiveInterval = duration / count;
  const interval = Math.max(naiveInterval, minIntervalSec);
  const start = interval / 2;

  const raw: number[] = [];
  for (let i = 0; i < count; i++) raw.push(start + i * interval);

  const last = raw[raw.length - 1];
  if (last > duration) {
    warnings.push(
      `Durasi ${duration.toFixed(2)}s terlalu pendek untuk ${count} thumbnail unik ` +
        `(min interval ${minIntervalSec}s). Beberapa timestamp akan bertumpuk.`
    );
  }

  const timestamps = raw.map((t) => Math.min(Math.max(t, 0), Math.max(duration - 0.01, 0)));
  return { timestamps, warnings };
}
