import type { BrightnessMap } from "./probe";

export function hammingDistance(a: bigint, b: bigint): number {
  let x = a ^ b;
  let count = 0;
  while (x !== 0n) {
    // popcount 8-bit chunks (bigint pop tidak native — pakai loop bit)
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

export type DedupItem = {
  accountId: string;
  targetSec: number;
  finalSec: number;
  dHash: bigint;
  similar: boolean;
};

export type ReExtractFn = (
  accountId: string,
  newSec: number
) => Promise<{ dHash: bigint }>;

/**
 * Dedup perseptual: kalau ada pasangan item dengan Hamming distance < threshold,
 * geser salah satu ke kandidat brightMap layak terdekat, rehash, cek lagi.
 * Max maxWalks per offender. Sisa collision → similar: true (tidak fail).
 */
export async function dedupAndAdjust(
  initial: Array<{
    accountId: string;
    targetSec: number;
    finalSec: number;
    dHash: bigint;
  }>,
  brightMap: BrightnessMap,
  minY: number,
  reExtract: ReExtractFn,
  opts: { threshold?: number; maxWalks?: number; minGapSec?: number } = {}
): Promise<DedupItem[]> {
  const threshold = opts.threshold ?? 10;
  const maxWalks = opts.maxWalks ?? 5;
  const minGap = opts.minGapSec ?? 0.3;

  const items: DedupItem[] = initial.map((it) => ({ ...it, similar: false }));

  // Sample layak (brightness OK) di-urut berdasarkan sec — kandidat walk
  const brightCandidates = brightMap.samples
    .filter((s) => s.yavg >= minY)
    .map((s) => s.sec);

  for (let pass = 0; pass < items.length * maxWalks; pass++) {
    const collision = findFirstCollision(items, threshold);
    if (!collision) break;

    const [i, j] = collision;
    // Pilih offender: item dengan targetSec lebih besar (biar item awal duluan pegang slot)
    const offenderIdx = items[i].targetSec > items[j].targetSec ? i : j;
    const offender = items[offenderIdx];

    const usedSecs = items.map((it, k) => (k === offenderIdx ? -Infinity : it.finalSec));

    const nextSec = pickCandidateSec(
      brightCandidates,
      offender.targetSec,
      usedSecs,
      minGap,
      offender.finalSec
    );
    if (nextSec == null) {
      offender.similar = true;
      // Cek pair lain — mungkin ada offender lain yang bisa dipindah
      // Tandai skip: lanjut ke pass berikutnya, tapi kalau collision sama muncul
      // lagi terhadap item ini, item lain yang akan digeser.
      continue;
    }

    const { dHash } = await reExtract(offender.accountId, nextSec);
    offender.finalSec = nextSec;
    offender.dHash = dHash;
  }

  // Final scan: yang masih collision setelah budget habis → similar
  const collisionSet = new Set<number>();
  for (let i = 0; i < items.length; i++) {
    for (let k = i + 1; k < items.length; k++) {
      if (hammingDistance(items[i].dHash, items[k].dHash) < threshold) {
        collisionSet.add(i);
        collisionSet.add(k);
      }
    }
  }
  for (const idx of collisionSet) items[idx].similar = true;

  return items;
}

function findFirstCollision(
  items: Array<{ dHash: bigint }>,
  threshold: number
): [number, number] | null {
  for (let i = 0; i < items.length; i++) {
    for (let k = i + 1; k < items.length; k++) {
      if (hammingDistance(items[i].dHash, items[k].dHash) < threshold) {
        return [i, k];
      }
    }
  }
  return null;
}

function pickCandidateSec(
  candidates: number[],
  targetSec: number,
  usedSecs: number[],
  minGap: number,
  currentSec: number
): number | null {
  // Urut kandidat berdasarkan jarak ke targetSec; skip yang terlalu dekat dengan used
  const sorted = [...candidates].sort(
    (a, b) => Math.abs(a - targetSec) - Math.abs(b - targetSec)
  );
  for (const c of sorted) {
    if (Math.abs(c - currentSec) < 0.01) continue; // jangan ke titik yang sama
    if (usedSecs.some((u) => Math.abs(u - c) < minGap)) continue;
    return c;
  }
  return null;
}
