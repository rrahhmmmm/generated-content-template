import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import type { TemplateLayout } from "@/types/template-layout";
import { loadFont } from "@/lib/fonts";
import { buildFilterComplex, computeIntroFit } from "./filter";

const FFMPEG_BIN = process.env.FFMPEG_PATH || (ffmpegStatic as unknown as string) || "ffmpeg";

export type CompositeInput = {
  backgroundJpg: string; // raw thumbnail per-akun (frame video mentah, sudah scaled ke template dim)
  framePath: string; // PNG frame overlay
  introPath: string | null; // PNG intro card (atau null kalau template tidak pakai)
  fontPath: string;
  layout: TemplateLayout;
  thumbText: string;
  outputJpg: string;
  workDir: string; // untuk textfile per baris (l1.txt, l2.txt, ...)
};

/**
 * Composite raw thumbnail dengan overlay template (frame + intro card + text)
 * — hasilnya sama komposisi dengan frame video di detik 0-5, tapi background
 * pakai frame video unik per akun (bukan detik 0 yang sama).
 *
 * Dipakai untuk cover embed di Instagram/Reels supaya:
 *   1. Cover kelihatan sama branded style dengan video (frame + text)
 *   2. Tetap unik per akun (background frame beda)
 *
 * Reuse buildFilterComplex + computeIntroFit dari pipeline render video.
 * Input 0 = image (bukan video) — FFmpeg treat sebagai 1-frame video di t=0,
 * jadi `enable='lt(t,END)'` di filter tetap evaluate true.
 */
export async function compositeThumbnail(inp: CompositeInput): Promise<void> {
  await fs.mkdir(inp.workDir, { recursive: true });
  await fs.mkdir(path.dirname(inp.outputJpg), { recursive: true });

  const font = await loadFont(path.basename(inp.fontPath));
  const fit = computeIntroFit(font, inp.thumbText, inp.layout);

  if (fit) {
    for (let i = 0; i < fit.lines.length; i++) {
      await fs.writeFile(path.join(inp.workDir, `l${i + 1}.txt`), fit.lines[i], "utf8");
    }
  }

  const built = buildFilterComplex({
    layout: inp.layout,
    fontPath: inp.fontPath,
    textLinesDir: inp.workDir,
    fit: fit ?? { fontSize: 0, lines: [], truncated: false },
    font,
  });

  const args: string[] = ["-y", "-i", inp.backgroundJpg, "-i", inp.framePath];
  if (inp.layout.intro) {
    if (!inp.introPath) throw new Error("layout.intro !== null tapi introPath null");
    args.push("-i", inp.introPath);
  }
  args.push(
    "-filter_complex",
    built.filterComplex,
    "-map",
    "[out]",
    "-frames:v",
    "1",
    "-q:v",
    "3",
    inp.outputJpg
  );

  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (c) => {
      stderr += c.toString();
      if (stderr.length > 100_000) stderr = stderr.slice(-50_000);
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg composite exit ${code}\n---\n${stderr.slice(-2000)}`));
    });
  });
}
