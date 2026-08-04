import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import type { TemplateLayout } from "@/types/template-layout";
import { loadFont } from "@/lib/fonts";
import { buildFilterComplex, computeIntroFit } from "./filter";

// Utamakan binary yang di-bundle via ffmpeg-static (menjamin drawtext + libfreetype
// tersedia di semua platform worker). Kalau env FFMPEG_PATH di-set, itu menang —
// berguna kalau worker punya build custom (mis. Rust + SIMD).
const FFMPEG_BIN = process.env.FFMPEG_PATH || (ffmpegStatic as unknown as string) || "ffmpeg";

export type RenderInput = {
  renditionId: string;
  sourcePath: string;      // path absolut ke video sumber
  framePath: string;       // path absolut ke frame PNG
  introPath: string | null;// path absolut ke intro PNG (atau null)
  fontPath: string;        // path absolut ke .ttf
  layout: TemplateLayout;
  thumbText: string;
  outputPath: string;      // path absolut untuk MP4 hasil
  workDir: string;         // direktori untuk textfile per baris + temp
};

export type RenderResult = {
  outputPath: string;
  durationMs: number;
  fontSize: number;
  lines: string[];
  truncated: boolean;
  hadIntro: boolean;
};

export async function render(inp: RenderInput): Promise<RenderResult> {
  const started = Date.now();
  await fs.mkdir(inp.workDir, { recursive: true });
  await fs.mkdir(path.dirname(inp.outputPath), { recursive: true });

  const font = await loadFont(path.basename(inp.fontPath));
  const fit = computeIntroFit(font, inp.thumbText, inp.layout);

  // Tulis textfile per baris. Nama file l1.txt … l{n}.txt harus konsisten dengan filter.
  if (fit) {
    for (let i = 0; i < fit.lines.length; i++) {
      await fs.writeFile(path.join(inp.workDir, `l${i + 1}.txt`), fit.lines[i], "utf8");
    }
  }

  // Build filter_complex — kalau tidak ada intro, filter tetap valid tanpa input [2].
  const built = buildFilterComplex({
    layout: inp.layout,
    fontPath: inp.fontPath,
    textLinesDir: inp.workDir,
    fit: fit ?? { fontSize: 0, lines: [], truncated: false },
    font,
  });

  const args: string[] = [
    "-y",
    "-threads",
    "4",
    "-filter_threads",
    "2",
    "-filter_complex_threads",
    "1",
    "-i",
    inp.sourcePath,
    "-i",
    inp.framePath,
  ];
  if (inp.layout.intro) {
    if (!inp.introPath) throw new Error("layout.intro !== null tapi introPath null");
    args.push("-i", inp.introPath);
  }
  args.push(
    "-filter_complex",
    built.filterComplex,
    "-map",
    "[out]",
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-threads",
    "4",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    inp.outputPath
  );

  await runFfmpeg(args);

  return {
    outputPath: inp.outputPath,
    durationMs: Date.now() - started,
    fontSize: fit?.fontSize ?? 0,
    lines: fit?.lines ?? [],
    truncated: fit?.truncated ?? false,
    hadIntro: built.hasIntro,
  };
}

async function runFfmpeg(args: string[]): Promise<void> {
  // Observability: baseline pids saat spawn — untuk menjawab pertanyaan
  // elevator (kegagalan historis terjadi sequential, sumber elevasi
  // baseline belum teridentifikasi). Lihat docs/error-ffmpeg.md §6.
  let pidsAtSpawn = -1;
  try {
    const raw = await fs.readFile("/sys/fs/cgroup/pids.current", "utf8");
    pidsAtSpawn = parseInt(raw.trim(), 10);
  } catch {
    // non-cgroup env (dev macOS) — abaikan
  }
  console.log(`[render] spawning ffmpeg, pids.current=${pidsAtSpawn}`);

  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      // Batasi ukuran memori ketika ffmpeg verbose
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}\n---\n${stderr.slice(-4000)}`));
    });
  });
}

// ffmpeg-static hanya membundel ffmpeg; ffprobe harus dari paket terpisah.
// Tanpa ini FFPROBE_BIN jatuh ke PATH host → ENOENT di container Railway.
const FFPROBE_BIN = process.env.FFPROBE_PATH || ffprobeStatic.path || "ffprobe";

export async function probeDuration(sourcePath: string): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      FFPROBE_BIN,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        sourcePath,
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    let out = "";
    proc.stdout.on("data", (c) => (out += c.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) return resolve(null);
      const n = parseFloat(out.trim());
      resolve(Number.isFinite(n) ? n : null);
    });
  });
}
