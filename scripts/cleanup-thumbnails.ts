/**
 * Hapus file preview/uploaded thumbnail di local storage yang mtime > 7 hari.
 * Untuk R2 prod: gunakan lifecycle rule di docs/r2-lifecycle.json (aws s3api).
 *
 * Usage:
 *   pnpm cleanup-thumbnails            # dry-run OFF, hapus beneran
 *   pnpm cleanup-thumbnails --dry-run  # cuma print apa yang akan dihapus
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const DRY = process.argv.includes("--dry-run");
const TTL_DAYS = 7;
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;

const STORAGE_ROOT = path.resolve(
  process.cwd(),
  process.env.STORAGE_LOCAL_DIR || "./storage"
);
const PREFIXES = ["thumbnails/preview", "thumbnails/uploaded"];

type Stats = { scanned: number; deleted: number; kept: number; bytesFreed: number };

async function cleanupDir(dir: string, stats: Stats): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return; // dir belum ada
  }
  const now = Date.now();
  for (const name of entries) {
    const full = path.join(dir, name);
    const st = await fs.stat(full).catch(() => null);
    if (!st) continue;
    if (st.isDirectory()) {
      await cleanupDir(full, stats);
      // Coba hapus dir kalau sudah kosong
      const remaining = await fs.readdir(full).catch(() => []);
      if (remaining.length === 0 && !DRY) {
        await fs.rmdir(full).catch(() => {});
      }
      continue;
    }
    stats.scanned++;
    const age = now - st.mtimeMs;
    if (age > TTL_MS) {
      console.log(
        `  ${DRY ? "(dry)" : "✗"} hapus  ${full}  (age ${(age / (24 * 60 * 60 * 1000)).toFixed(1)}d, ${(st.size / 1024).toFixed(1)} KB)`
      );
      if (!DRY) await fs.unlink(full).catch(() => {});
      stats.deleted++;
      stats.bytesFreed += st.size;
    } else {
      stats.kept++;
    }
  }
}

async function main() {
  console.log(`→ Storage root: ${STORAGE_ROOT}`);
  console.log(`→ TTL: ${TTL_DAYS} hari${DRY ? "  (dry-run)" : ""}\n`);

  const stats: Stats = { scanned: 0, deleted: 0, kept: 0, bytesFreed: 0 };
  for (const prefix of PREFIXES) {
    console.log(`Scanning ${prefix}/`);
    await cleanupDir(path.join(STORAGE_ROOT, prefix), stats);
  }

  console.log(
    `\n→ Selesai. Scanned: ${stats.scanned}, dihapus: ${stats.deleted}, kept: ${stats.kept}, ` +
      `freed: ${(stats.bytesFreed / 1024 / 1024).toFixed(2)} MB`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
