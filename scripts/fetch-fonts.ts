/**
 * Download curated Google Fonts TTF files ke public/fonts/.
 * Idempotent: skip file yang sudah ada. Pakai --force untuk overwrite.
 *
 * Usage:
 *   pnpm fonts:fetch
 *   pnpm fonts:fetch --force
 */
import { promises as fs } from "node:fs";
import path from "node:path";

type FontSpec = { filename: string; url: string };

// Catatan: sebagian font di repo google/fonts sekarang hanya tersedia sebagai
// variable font. Filename lokal dipilih tanpa karakter khusus supaya aman
// dilewatkan ke FFmpeg drawtext.
const FONTS: FontSpec[] = [
  // Display / heading tebal
  { filename: "Anton-Regular.ttf",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf" },
  { filename: "BebasNeue-Regular.ttf",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/bebasneue/BebasNeue-Regular.ttf" },
  { filename: "Oswald-Variable.ttf",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/oswald/Oswald%5Bwght%5D.ttf" },
  { filename: "ArchivoBlack-Regular.ttf",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/archivoblack/ArchivoBlack-Regular.ttf" },
  { filename: "FjallaOne-Regular.ttf",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/fjallaone/FjallaOne-Regular.ttf" },
  { filename: "AlfaSlabOne-Regular.ttf",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/alfaslabone/AlfaSlabOne-Regular.ttf" },
  { filename: "Montserrat-Variable.ttf",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf" },
  { filename: "PassionOne-Black.ttf",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/passionone/PassionOne-Black.ttf" },
  { filename: "Ultra-Regular.ttf",
    url: "https://raw.githubusercontent.com/google/fonts/main/apache/ultra/Ultra-Regular.ttf" },
  { filename: "RubikMonoOne-Regular.ttf",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/rubikmonoone/RubikMonoOne-Regular.ttf" },
  { filename: "Staatliches-Regular.ttf",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/staatliches/Staatliches-Regular.ttf" },

  // Serif / editorial (semua variable font)
  { filename: "PlayfairDisplay-Variable.ttf",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf" },
  { filename: "DMSerifDisplay-Regular.ttf",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/dmserifdisplay/DMSerifDisplay-Regular.ttf" },
  { filename: "Merriweather-Variable.ttf",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/merriweather/Merriweather%5Bopsz%2Cwdth%2Cwght%5D.ttf" },
  { filename: "LibreBodoni-Variable.ttf",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/librebodoni/LibreBodoni%5Bwght%5D.ttf" },
  { filename: "BodoniModa-Variable.ttf",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/bodonimoda/BodoniModa%5Bopsz%2Cwght%5D.ttf" },
  { filename: "CormorantGaramond-Variable.ttf",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/cormorantgaramond/CormorantGaramond%5Bwght%5D.ttf" },
];

const FORCE = process.argv.includes("--force");
const OUT_DIR = path.resolve(process.cwd(), "public/fonts");
const MIN_SIZE = 1024; // sanity check: TTF pasti > 1 KB

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function downloadOne(spec: FontSpec): Promise<"ok" | "skipped" | "failed"> {
  const dest = path.join(OUT_DIR, spec.filename);
  if (!FORCE && (await exists(dest))) {
    console.log(`  ↷ skip  ${spec.filename} (sudah ada)`);
    return "skipped";
  }
  try {
    const res = await fetch(spec.url);
    if (!res.ok) {
      console.error(`  ✗ FAIL  ${spec.filename} — HTTP ${res.status} ${res.statusText}`);
      return "failed";
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength < MIN_SIZE) {
      console.error(`  ✗ FAIL  ${spec.filename} — file terlalu kecil (${buf.byteLength} B), kemungkinan bukan TTF`);
      return "failed";
    }
    await fs.writeFile(dest, buf);
    const kb = (buf.byteLength / 1024).toFixed(1);
    console.log(`  ✓ ok    ${spec.filename} (${kb} KB)`);
    return "ok";
  } catch (err) {
    console.error(`  ✗ FAIL  ${spec.filename} — ${(err as Error).message}`);
    return "failed";
  }
}

// Font proprietary (Microsoft/Apple) — TIDAK BOLEH redistribusi.
// Di-copy dari system font path lokal kalau ada. Filenya di-.gitignore.
type LocalFontSpec = { filename: string; sources: string[] };

const LOCAL_FONTS: LocalFontSpec[] = [
  {
    filename: "ArialBlack.ttf",
    sources: [
      "/System/Library/Fonts/Supplemental/Arial Black.ttf", // macOS
      "C:\\Windows\\Fonts\\ariblk.ttf",                     // Windows
    ],
  },
];

async function copyLocalOne(spec: LocalFontSpec): Promise<"ok" | "skipped" | "failed"> {
  const dest = path.join(OUT_DIR, spec.filename);
  if (!FORCE && (await exists(dest))) {
    console.log(`  ↷ skip  ${spec.filename} (sudah ada)`);
    return "skipped";
  }
  for (const src of spec.sources) {
    if (await exists(src)) {
      try {
        await fs.copyFile(src, dest);
        const size = (await fs.stat(dest)).size;
        console.log(`  ✓ copy  ${spec.filename} ← ${src} (${(size / 1024).toFixed(1)} KB)`);
        return "ok";
      } catch (err) {
        console.error(`  ✗ FAIL  ${spec.filename} — ${(err as Error).message}`);
        return "failed";
      }
    }
  }
  console.warn(
    `  ⚠ skip  ${spec.filename} — proprietary font, tidak ditemukan di system paths. ` +
      `Skip di dropdown UI tidak otomatis; kalau kamu tidak butuh, hapus entri dari font-catalog.ts.`
  );
  return "skipped";
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  console.log(`→ Target: ${OUT_DIR}`);
  console.log(`→ ${FONTS.length} font Google (${FORCE ? "force overwrite" : "skip existing"})\n`);

  const results = { ok: 0, skipped: 0, failed: 0 };
  for (const spec of FONTS) {
    const r = await downloadOne(spec);
    results[r]++;
  }

  console.log(`\n→ ${LOCAL_FONTS.length} font proprietary dari system (tidak dicommit ke git):\n`);
  for (const spec of LOCAL_FONTS) {
    const r = await copyLocalOne(spec);
    results[r]++;
  }

  console.log(`\n→ Selesai: ${results.ok} ok, ${results.skipped} skip, ${results.failed} gagal`);
  if (results.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
