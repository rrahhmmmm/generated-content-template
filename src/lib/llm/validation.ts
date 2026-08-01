import type { RewriteBatchInput, RewriteBatchItem } from "./index";
import { MAX_THUMB_WORDS } from "./index";

// Validasi output LLM. Return shape per akun: { ok: true, ... } atau { ok: false, reason }.
// Behavior fallback per mode ditangani di worker (process-job.ts):
// - mode "generate": tidak ada teks user → invalid → rendition FAILED.
// - mode "rewrite":  ada baseCaption/baseThumbText → fallback ke situ (fellBack: true),
//                    tapi thumbText tetap ditruncate ke MAX_THUMB_WORDS kata.

type RawResult = { accountId?: unknown; caption?: unknown; thumbText?: unknown };

export function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export function truncateWords(s: string, maxWords: number): string {
  const words = s.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ");
}

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

    // Try LLM output first
    if (raw && typeof raw.caption === "string" && typeof raw.thumbText === "string") {
      const c = raw.caption.trim();
      let t = raw.thumbText.trim();

      if (c.length === 0 || t.length === 0) {
        items.push(fallbackOrFail(input, acc.accountId, "caption/thumbText kosong dari LLM"));
        continue;
      }

      // Enforce 90-word cap. Untuk "rewrite" mode truncate saja; untuk "generate"
      // truncate juga (LLM diminta ≤90; kalau sedikit over, potong daripada FAILED).
      if (countWords(t) > MAX_THUMB_WORDS) {
        t = truncateWords(t, MAX_THUMB_WORDS);
      }

      items.push({
        ok: true,
        accountId: acc.accountId,
        caption: c,
        thumbText: t,
        fellBack: false,
      });
      continue;
    }

    // Tidak ada hasil LLM untuk akun ini → fallback (rewrite) atau fail (generate)
    items.push(fallbackOrFail(input, acc.accountId, "tidak ada hasil LLM untuk accountId ini"));
  }
  return items;
}

function fallbackOrFail(
  input: RewriteBatchInput,
  accountId: string,
  reason: string
): RewriteBatchItem {
  if (input.mode === "rewrite") {
    const caption = input.baseCaption;
    let thumb = input.baseThumbText;
    if (countWords(thumb) > MAX_THUMB_WORDS) {
      thumb = truncateWords(thumb, MAX_THUMB_WORDS);
    }
    return {
      ok: true,
      accountId,
      caption,
      thumbText: thumb,
      fellBack: true,
    };
  }
  return { ok: false, accountId, reason };
}
