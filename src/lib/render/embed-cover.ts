import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";

const FFMPEG_BIN = process.env.FFMPEG_PATH || (ffmpegStatic as unknown as string) || "ffmpeg";

/**
 * Prepend cover image sebagai N ms pertama video. Tujuan: Instagram/Reels
 * biasanya pick frame 0 sebagai cover default, jadi thumbnail unik yang sudah
 * kita generate benar-benar kepakai di feed IG tanpa perlu user pilih manual.
 *
 * Approach: FFmpeg re-encode dengan filter_complex concat:
 *   - input 0: cover.jpg di-loop selama coverSec
 *   - input 1: video (h264+aac)
 *   - input 2: silence lavfi selama coverSec (audio sinkron)
 *   - scale2ref: force cover conform ke video dims (dan cover jpg biasanya
 *     sudah match kalau di-generate dari template.width/height, jadi ini
 *     safety net untuk fallback thumbnail)
 *
 * Trade-off: user akan liat "flash" cover ~150ms di awal Reel. Bisa tuning
 * via COVER_FRAME_DURATION_SEC env kalau mau lebih pendek/panjang.
 */
export async function embedCoverFrame(
  coverJpg: string,
  videoIn: string,
  videoOut: string,
  opts: { coverSec?: number; fps?: number } = {}
): Promise<void> {
  const coverSec = opts.coverSec ?? 0.15;
  const fps = opts.fps ?? 30;

  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      // input 0: cover image, loop selama coverSec
      "-loop",
      "1",
      "-t",
      String(coverSec),
      "-i",
      coverJpg,
      // input 1: video utama
      "-i",
      videoIn,
      // input 2: silence audio selama coverSec (biar sinkron setelah concat)
      "-f",
      "lavfi",
      "-t",
      String(coverSec),
      "-i",
      "anullsrc=r=48000:cl=stereo",
      // filter_complex: normalisasi cover ke dim video + concat video & audio
      "-filter_complex",
      `[0:v][1:v]scale2ref=w=iw:h=ih[cov0][main0];` +
        `[cov0]setsar=1,fps=${fps},format=yuv420p[cov];` +
        `[main0]setsar=1,fps=${fps},format=yuv420p[main];` +
        `[cov][main]concat=n=2:v=1:a=0[outv];` +
        `[2:a][1:a]concat=n=2:v=0:a=1[outa]`,
      "-map",
      "[outv]",
      "-map",
      "[outa]",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
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
      videoOut,
    ];
    const proc = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (c) => (stderr += c.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg embed cover exit ${code}: ${stderr.slice(-600)}`));
    });
  });
}
