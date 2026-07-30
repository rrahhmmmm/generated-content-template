import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";

const FFMPEG_BIN = process.env.FFMPEG_PATH || (ffmpegStatic as unknown as string) || "ffmpeg";

/**
 * Extract 1 frame di detik atSec + hitung dHash 64-bit dalam 1 spawn FFmpeg.
 * filter_complex punya 2 output:
 *   - [thumb]  → di-encode JPG, ditulis ke outJpg
 *   - [hash]   → 9x8 grayscale, di-pipe ke stdout sebagai rawvideo (72 bytes)
 *
 * dHash: bit[i,j] = px[i,j] > px[i,j+1] untuk i=0..7, j=0..7 → 64 bit bigint.
 */
export async function extractFrameWithHash(
  source: string,
  atSec: number,
  outJpg: string,
  opts: { width: number; height: number }
): Promise<{ dHash: bigint }> {
  const { width: w, height: h } = opts;
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-ss",
      String(atSec),
      "-i",
      source,
      "-frames:v",
      "1",
      "-filter_complex",
      `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}[thumb];` +
        `[0:v]scale=9:8:flags=area,format=gray[hash]`,
      "-map",
      "[thumb]",
      "-q:v",
      "3",
      outJpg,
      "-map",
      "[hash]",
      "-f",
      "rawvideo",
      "pipe:1",
    ];
    const proc = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let stderr = "";
    proc.stdout.on("data", (c: Buffer) => chunks.push(c));
    proc.stderr.on("data", (c) => (stderr += c.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`ffmpeg extract exit ${code}: ${stderr.slice(-500)}`));
      }
      const buf = Buffer.concat(chunks);
      if (buf.length < 72) {
        return reject(new Error(`hash pipe underflow: got ${buf.length} bytes, expected 72`));
      }
      resolve({ dHash: computeDHash(buf.subarray(0, 72)) });
    });
  });
}

/**
 * Compute dHash dari 9x8 grayscale buffer (72 bytes, row-major).
 * Bit i,j = 1 kalau px[i,j] > px[i,j+1], hasil 64 bit disimpan sebagai bigint.
 */
export function computeDHash(gray9x8: Buffer): bigint {
  let hash = 0n;
  let bitIdx = 0n;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left = gray9x8[row * 9 + col];
      const right = gray9x8[row * 9 + col + 1];
      if (left > right) hash |= 1n << bitIdx;
      bitIdx += 1n;
    }
  }
  return hash;
}
