import type { RewriteBatchInput, RewriteBatchItem } from "./index";

// Validasi output LLM + fallback per-akun. Aturan plan.md §6:
// - Tiap accountId di input harus ada di output; kalau kurang → fallback teks asli
// - thumbText.length <= maxChars (kalau lebih → truncate di batas kata)
// - thumbText tidak boleh kosong
// Kalau validasi satu akun gagal, pakai teks asli untuk akun itu, JANGAN gagalkan
// seluruh job.

type RawResult = { accountId?: unknown; caption?: unknown; thumbText?: unknown };

export function validateAndFallback(
  input: RewriteBatchInput,
  rawResults: RawResult[]
): RewriteBatchItem[] {
  const byId = new Map<string, RawResult>();
  for (const r of rawResults) {
    if (typeof r?.accountId === "string") byId.set(r.accountId, r);
  }

  const items: RewriteBatchItem[] = [];
  for (const acc of input.accounts) {
    const raw = byId.get(acc.accountId);

    let caption = input.baseCaption;
    let thumb = input.baseThumbText;
    let fellBack = true;

    if (raw && typeof raw.caption === "string" && typeof raw.thumbText === "string") {
      const c = raw.caption.trim();
      let t = raw.thumbText.trim();

      // Truncate thumb di batas kata kalau over
      if (t.length > acc.maxThumbChars) {
        t = truncateAtWord(t, acc.maxThumbChars);
      }

      if (c.length > 0 && t.length > 0) {
        caption = c;
        thumb = t;
        fellBack = false;
      }
    }

    // Bahkan kalau LLM sukses, teks asli tetap disingkatkan agar tidak overflow.
    if (fellBack && thumb.length > acc.maxThumbChars) {
      thumb = truncateAtWord(thumb, acc.maxThumbChars);
    }

    items.push({ accountId: acc.accountId, caption, thumbText: thumb, fellBack });
  }
  return items;
}

function truncateAtWord(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  const cut = s.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > maxLen * 0.6) return cut.slice(0, lastSpace).trim();
  return cut.trim();
}
