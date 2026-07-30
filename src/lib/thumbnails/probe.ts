import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";

const FFMPEG_BIN = process.env.FFMPEG_PATH || (ffmpegStatic as unknown as string) || "ffmpeg";

export type BrightnessSample = { sec: number; yavg: number };
export type BrightnessMap = { step: number; samples: BrightnessSample[] };

/**
 * BATCH brightness sampling — 1 FFmpeg spawn untuk seluruh video.
 * Command: fps=1/step,signalstats,metadata=print:file=- → stderr baris:
 *   frame:N pts:P pts_time:TTT
 *   lavfi.signalstats.YAVG=V
 * Kita parse berpasangan pts_time + YAVG.
 */
export function probeBrightnessMap(source: string, step = 0.5): Promise<BrightnessMap> {
  return new Promise((resolve, reject) => {
    const args = [
      "-i",
      source,
      "-vf",
      `fps=1/${step},signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-`,
      "-f",
      "null",
      "-",
    ];
    const proc = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    proc.stdout.on("data", (c) => (out += c.toString()));
    proc.stderr.on("data", (c) => (err += c.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`ffmpeg probeBrightness exit ${code}: ${err.slice(-500)}`));
      }
      // metadata=print:file=- menulis ke stdout — kalau ternyata FFmpeg build
      // tidak dukung, fallback parsing dari stderr.
      const text = out || err;
      resolve({ step, samples: parseSignalstats(text) });
    });
  });
}

function parseSignalstats(text: string): BrightnessSample[] {
  const samples: BrightnessSample[] = [];
  const lines = text.split(/\r?\n/);
  let currentSec: number | null = null;
  for (const line of lines) {
    const ptsMatch = line.match(/pts_time:([\d.]+)/);
    if (ptsMatch) {
      currentSec = parseFloat(ptsMatch[1]);
      continue;
    }
    const yavgMatch = line.match(/YAVG=([\d.]+)/);
    if (yavgMatch && currentSec !== null) {
      samples.push({ sec: currentSec, yavg: parseFloat(yavgMatch[1]) });
      currentSec = null;
    }
  }
  return samples;
}

/**
 * Threshold brightness adaptif: p25 dari sampling × 0.7, dengan floor absolut 20.
 * Menghindari kasus "semua frame ter-flag adjusted" pada video dark-graded.
 */
export function computeAdaptiveMinY(map: BrightnessMap): number {
  const ABSOLUTE_FLOOR = 20;
  if (map.samples.length === 0) return ABSOLUTE_FLOOR;
  const sorted = map.samples.map((s) => s.yavg).sort((a, b) => a - b);
  const p25 = sorted[Math.floor(sorted.length * 0.25)] ?? sorted[0];
  return Math.max(ABSOLUTE_FLOOR, p25 * 0.7);
}

/**
 * Cari sample terdekat dari targetSec yang yavg >= minY dalam window ±windowSec.
 * Pure in-memory lookup — tidak spawn FFmpeg tambahan.
 */
export function nearestBrightSec(
  map: BrightnessMap,
  targetSec: number,
  minY: number,
  windowSec = 3
): { sec: number; yavg: number; adjusted: boolean } {
  // Cek exact target dulu (interpolasi ke sample terdekat)
  const nearestAtTarget = findNearestSample(map.samples, targetSec);
  if (nearestAtTarget && nearestAtTarget.yavg >= minY) {
    return { sec: nearestAtTarget.sec, yavg: nearestAtTarget.yavg, adjusted: false };
  }

  // Walk keluar dari target
  const candidates = map.samples
    .filter((s) => Math.abs(s.sec - targetSec) <= windowSec && s.yavg >= minY)
    .sort((a, b) => Math.abs(a.sec - targetSec) - Math.abs(b.sec - targetSec));

  if (candidates.length > 0) {
    return { sec: candidates[0].sec, yavg: candidates[0].yavg, adjusted: true };
  }

  // Semua gelap → fallback pakai target apa adanya (frame tetap di-extract nanti)
  return {
    sec: targetSec,
    yavg: nearestAtTarget?.yavg ?? 0,
    adjusted: true,
  };
}

function findNearestSample(samples: BrightnessSample[], sec: number): BrightnessSample | null {
  if (samples.length === 0) return null;
  let best = samples[0];
  let bestDist = Math.abs(best.sec - sec);
  for (const s of samples) {
    const d = Math.abs(s.sec - sec);
    if (d < bestDist) {
      best = s;
      bestDist = d;
    }
  }
  return best;
}
