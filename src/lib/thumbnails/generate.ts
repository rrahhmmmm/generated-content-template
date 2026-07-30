import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { probeDuration } from "@/lib/render";
import { PLATFORM_ASPECT, type Platform } from "@/lib/platforms";
import { distributeTimestamps } from "./distribute";
import { probeBrightnessMap, nearestBrightSec, computeAdaptiveMinY } from "./probe";
import { extractFrameWithHash } from "./extract";
import { dedupAndAdjust, type DedupItem } from "./dedup";

export type GeneratedThumb = {
  accountId: string;
  thumbnailKey: string;
  url: string;
  timestampSec: number;
  adjusted: boolean;
  similar: boolean;
  width: number;
  height: number;
};

/**
 * Orchestrator — dipanggil worker handler untuk job type "thumbnail-generation".
 * Idempotent: baca ThumbnailTask, kerjakan sekali, tulis hasil di items+status.
 * Tidak throw — semua error diserap jadi status FAILED + error message.
 */
export async function generateThumbnailsForTask(taskId: string): Promise<void> {
  const task = await prisma.thumbnailTask.findUnique({ where: { id: taskId } });
  if (!task) {
    console.warn(`[thumbgen] Task ${taskId} tidak ditemukan.`);
    return;
  }
  if (task.status === "DONE" || task.status === "FAILED") {
    console.log(`[thumbgen] Task ${taskId} sudah ${task.status}, skip.`);
    return;
  }

  const accountIds: string[] = JSON.parse(task.progress || "{}").accountIds ?? [];
  // NB: kita simpan accountIds di progress.accountIds saat POST (lihat route)
  //     supaya worker punya info lengkap tanpa payload terpisah.

  await prisma.thumbnailTask.update({
    where: { id: taskId },
    data: { status: "RUNNING", progress: JSON.stringify({ done: 0, total: accountIds.length, accountIds }) },
  });

  const workDir = path.join(os.tmpdir(), `thumbgen-${taskId}`);
  await fs.mkdir(workDir, { recursive: true });

  try {
    // 1. Materialize source
    const sourceObj = await storage().get(task.sourceKey);
    if (!sourceObj) throw new Error(`Source tidak ditemukan: ${task.sourceKey}`);
    const ext = path.extname(task.sourceKey) || ".mp4";
    const sourcePath = path.join(workDir, `source${ext}`);
    await fs.writeFile(sourcePath, sourceObj.buffer);

    // 2. Load accounts + template
    const accounts = await prisma.account.findMany({
      where: { id: { in: accountIds } },
      include: { template: true },
    });
    // Preserve urutan sesuai accountIds
    const accountMap = new Map(accounts.map((a) => [a.id, a]));
    const orderedAccounts = accountIds
      .map((id) => accountMap.get(id))
      .filter((a): a is (typeof accounts)[number] => Boolean(a));

    // 3. Duration + batch brightness probe (1 spawn)
    const duration = (await probeDuration(sourcePath)) ?? 0;
    if (duration <= 0) throw new Error("Durasi video tidak bisa dibaca.");

    const brightMap = await probeBrightnessMap(sourcePath, 0.5);
    const minY = computeAdaptiveMinY(brightMap);

    // 4. Distribute timestamps
    const { timestamps, warnings: distributeWarnings } = distributeTimestamps(
      duration,
      orderedAccounts.length,
      0.3
    );
    const warnings: string[] = [...distributeWarnings];

    // 5. Adjust target via brightness map (in-memory, no extra spawn)
    const adjustedTargets = timestamps.map((t) => nearestBrightSec(brightMap, t, minY, 3));

    // 6. Extract paralel (bounded concurrency 4) — combined extract+hash
    type ExtractResult = {
      accountId: string;
      targetSec: number;
      finalSec: number;
      dHash: bigint;
      adjusted: boolean;
      width: number;
      height: number;
      jpgPath: string;
    };
    const results: ExtractResult[] = [];
    const CONCURRENCY = 4;
    let done = 0;

    async function extractOne(idx: number) {
      const account = orderedAccounts[idx];
      const w = account.template?.width ?? PLATFORM_ASPECT[account.platform as Platform]?.w ?? 1080;
      const h = account.template?.height ?? PLATFORM_ASPECT[account.platform as Platform]?.h ?? 1920;
      const jpgPath = path.join(workDir, `${account.id}.jpg`);
      const { dHash } = await extractFrameWithHash(
        sourcePath,
        adjustedTargets[idx].sec,
        jpgPath,
        { width: w, height: h }
      );
      results[idx] = {
        accountId: account.id,
        targetSec: timestamps[idx],
        finalSec: adjustedTargets[idx].sec,
        dHash,
        adjusted: adjustedTargets[idx].adjusted,
        width: w,
        height: h,
        jpgPath,
      };
      done++;
      // Progress update (throttle-friendly: setiap item, cheap query)
      await prisma.thumbnailTask.update({
        where: { id: taskId },
        data: {
          progress: JSON.stringify({
            done,
            total: orderedAccounts.length,
            accountIds,
          }),
        },
      });
    }

    for (let i = 0; i < orderedAccounts.length; i += CONCURRENCY) {
      const batch = Array.from(
        { length: Math.min(CONCURRENCY, orderedAccounts.length - i) },
        (_, k) => extractOne(i + k)
      );
      await Promise.all(batch);
    }

    // 7. Dedup perseptual — walk kalau collision
    const dedupInput = results.map((r) => ({
      accountId: r.accountId,
      targetSec: r.targetSec,
      finalSec: r.finalSec,
      dHash: r.dHash,
    }));

    const reExtract = async (accountId: string, newSec: number) => {
      const idx = results.findIndex((r) => r.accountId === accountId);
      const r = results[idx];
      const { dHash } = await extractFrameWithHash(sourcePath, newSec, r.jpgPath, {
        width: r.width,
        height: r.height,
      });
      r.finalSec = newSec;
      r.dHash = dHash;
      // adjust flag: kalau di-walk oleh dedup → juga counts as adjusted
      r.adjusted = true;
      return { dHash };
    };

    const dedupResult: DedupItem[] = await dedupAndAdjust(
      dedupInput,
      brightMap,
      minY,
      reExtract,
      { threshold: 10, maxWalks: 5, minGapSec: 0.3 }
    );

    // Sync back finalSec & dHash ke results (dedup mungkin sudah update via reExtract)
    for (const d of dedupResult) {
      const r = results.find((x) => x.accountId === d.accountId);
      if (r) {
        r.finalSec = d.finalSec;
      }
    }

    const similarCount = dedupResult.filter((d) => d.similar).length;
    if (similarCount > 0) {
      warnings.push(
        `${similarCount} akun berpotensi punya thumbnail mirip — pertimbangkan override manual.`
      );
    }

    // 8. Upload ke storage — path include taskId + dimensi
    const items: GeneratedThumb[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const d = dedupResult.find((x) => x.accountId === r.accountId)!;
      const key = `thumbnails/preview/${taskId}/${r.accountId}_${r.width}x${r.height}.jpg`;
      const buf = await fs.readFile(r.jpgPath);
      await storage().put(key, buf, "image/jpeg");
      items.push({
        accountId: r.accountId,
        thumbnailKey: key,
        url: storage().getPublicUrl(key),
        timestampSec: r.finalSec,
        adjusted: r.adjusted,
        similar: d.similar,
        width: r.width,
        height: r.height,
      });
    }

    await prisma.thumbnailTask.update({
      where: { id: taskId },
      data: {
        status: "DONE",
        progress: JSON.stringify({ done: items.length, total: items.length, accountIds }),
        items: JSON.stringify(items),
        warnings: JSON.stringify(warnings),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[thumbgen] Task ${taskId} gagal:`, msg);
    await prisma.thumbnailTask.update({
      where: { id: taskId },
      data: { status: "FAILED", error: msg },
    });
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
