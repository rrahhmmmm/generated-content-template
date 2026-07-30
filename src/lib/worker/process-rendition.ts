import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { render } from "@/lib/render";
import { embedCoverFrame } from "@/lib/render/embed-cover";
import { compositeThumbnail } from "@/lib/render/composite-thumbnail";
import type { TemplateLayout } from "@/types/template-layout";

const FFMPEG_BIN = process.env.FFMPEG_PATH || (ffmpegStatic as unknown as string) || "ffmpeg";

// render-rendition: satu unit kerja (plan.md §5). Idempotent: kalau status
// sudah DONE, langsung return. Kalau gagal, tandai FAILED tanpa membangkrutkan
// job — rendition lain tetap lanjut (plan.md §1 boundary rendition).
export async function processRendition(renditionId: string): Promise<void> {
  const rendition = await prisma.rendition.findUnique({
    where: { id: renditionId },
    include: {
      job: true,
      account: { include: { template: true } },
    },
  });

  if (!rendition) {
    console.warn(`[render] Rendition ${renditionId} tidak ditemukan.`);
    return;
  }

  if (rendition.status === "DONE") {
    console.log(`[render] ${renditionId} sudah DONE, skip.`);
    return;
  }

  if (!rendition.account.template) {
    await failRendition(renditionId, "Akun tidak punya template");
    return;
  }
  if (!rendition.caption || !rendition.thumbText) {
    await failRendition(renditionId, "Caption/thumbText belum diisi (job-prep belum jalan?)");
    return;
  }

  const layout = JSON.parse(rendition.account.template.layout) as TemplateLayout;
  const workDir = path.join("/tmp", `rendition-${renditionId}`);
  await fs.mkdir(workDir, { recursive: true });

  const sourcePath = path.join(workDir, "source" + path.extname(rendition.job.sourceKey || ".mp4"));
  const framePath = path.join(workDir, "frame.png");
  const introPath = rendition.account.template.introKey ? path.join(workDir, "intro.png") : null;
  const outputPath = path.join(workDir, "out.mp4");
  const thumbnailPath = path.join(workDir, "thumb.jpg");

  try {
    await prisma.rendition.update({
      where: { id: renditionId },
      data: { status: "RENDERING", startedAt: new Date(), attempts: { increment: 1 } },
    });

    // 1. Materialize semua asset dari storage
    await Promise.all([
      materialize(rendition.job.sourceKey, sourcePath),
      materialize(rendition.account.template.frameKey, framePath),
      introPath && rendition.account.template.introKey
        ? materialize(rendition.account.template.introKey, introPath)
        : Promise.resolve(),
    ]);

    // 2. Render video
    const fontPath = path.resolve(
      process.cwd(),
      "public/fonts",
      layout.intro?.text.fontFile ?? "Inter-Black.ttf"
    );

    const result = await render({
      renditionId,
      sourcePath,
      framePath,
      introPath,
      fontPath,
      layout,
      thumbText: rendition.thumbText,
      outputPath,
      workDir,
    });

    // 3. Materialize raw thumbnail ke local file.
    //    Pre-job (Fase 5): download dari storage (background frame unik per akun).
    //    Fallback: extract dari detik 2 output video (sudah ada overlay — tapi kita
    //    tetap composite lagi supaya path kode uniform; hasil composite akan sedikit
    //    "double overlay" tapi hanya edge case saat user skip pre-job).
    const hasPreJobThumbnail = rendition.thumbnailKey !== null;
    const rawThumbPath = path.join(workDir, "raw-thumb.jpg");
    if (hasPreJobThumbnail) {
      const preObj = await storage().get(rendition.thumbnailKey!);
      if (preObj) await fs.writeFile(rawThumbPath, preObj.buffer);
    } else {
      // Fallback: extract dari SUMBER (bukan output) di detik 2 — biar composite
      // apply overlay clean tanpa double-overlay.
      await extractThumbnail(sourcePath, rawThumbPath, 2);
    }

    // 3.5. Composite thumbnail: apply frame overlay + intro card + text ke raw thumb.
    //      Hasilnya = single-frame image dengan branding sama seperti detik 0-5 video.
    //      Dipakai (a) sebagai final thumbnailKey (di DB & download bundle) dan
    //      (b) sebagai cover frame yang di-embed ke video output.
    const compositePath = path.join(workDir, "composite-thumb.jpg");
    let coverPath: string | null = null;
    try {
      await fs.access(rawThumbPath);
      await compositeThumbnail({
        backgroundJpg: rawThumbPath,
        framePath,
        introPath,
        fontPath,
        layout,
        thumbText: rendition.thumbText,
        outputJpg: compositePath,
        workDir,
      });
      coverPath = compositePath;
    } catch (err) {
      console.warn(
        `[render] Composite thumbnail gagal untuk ${renditionId}: ${(err as Error).message}. ` +
          `Fallback pakai raw thumbnail.`
      );
      // Kalau composite fail, pakai raw (kalau ada) atau skip cover embed
      try {
        await fs.access(rawThumbPath);
        coverPath = rawThumbPath;
      } catch {
        coverPath = null;
      }
    }

    // 3.6. Embed cover frame (Fase 6): prepend composite thumbnail sebagai frame
    //      0-Xms supaya Instagram auto-pick sebagai cover di Reels/Feed.
    //      Toggle: EMBED_COVER_FRAME=false untuk disable, COVER_FRAME_DURATION_SEC
    //      untuk tuning durasi flash (default 0.15s).
    const embedEnabled = process.env.EMBED_COVER_FRAME !== "false";
    const coverSec = parseFloat(process.env.COVER_FRAME_DURATION_SEC || "0.15");
    let videoForUpload = outputPath;
    if (embedEnabled && coverPath) {
      try {
        const withCoverPath = path.join(workDir, "out-with-cover.mp4");
        await embedCoverFrame(coverPath, outputPath, withCoverPath, { coverSec });
        videoForUpload = withCoverPath;
      } catch (err) {
        console.warn(
          `[render] Embed cover gagal untuk ${renditionId}, pakai video asli: ${
            (err as Error).message
          }`
        );
      }
    }

    // 4. Upload video (with cover kalau enabled) + thumbnail final (composite kalau ada).
    const outKey = `renditions/${rendition.jobId}/${renditionId}/output.mp4`;
    const thumbKeyFinal = `renditions/${rendition.jobId}/${renditionId}/thumb.jpg`;
    const outBuf = await fs.readFile(videoForUpload);
    await storage().put(outKey, outBuf, "video/mp4");

    // Thumbnail: prioritas composite → raw → tetap null (rare edge case).
    const thumbForUploadPath = coverPath ?? (hasPreJobThumbnail ? rawThumbPath : thumbnailPath);
    try {
      const thumbBuf = await fs.readFile(thumbForUploadPath);
      await storage().put(thumbKeyFinal, thumbBuf, "image/jpeg");
    } catch (err) {
      console.warn(
        `[render] Upload thumbnail gagal untuk ${renditionId}: ${(err as Error).message}`
      );
    }

    // 5. Update rendition + rekalkulasi status job
    await prisma.rendition.update({
      where: { id: renditionId },
      data: {
        status: "DONE",
        outputKey: outKey,
        thumbnailKey: thumbKeyFinal,
        finishedAt: new Date(),
        errorMessage: result.truncated
          ? "Teks thumbnail dipotong karena melampaui ukuran minimum"
          : null,
      },
    });

    await recomputeJobStatus(rendition.jobId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[render] ${renditionId} gagal:`, msg);
    await failRendition(renditionId, msg);
    await recomputeJobStatus(rendition.jobId);
  } finally {
    // Hapus workDir walau ada error (plan.md §5 langkah 10)
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function materialize(key: string, dest: string): Promise<void> {
  const obj = await storage().get(key);
  if (!obj) throw new Error(`Storage key tidak ditemukan: ${key}`);
  await fs.writeFile(dest, obj.buffer);
}

function extractThumbnail(inputVideo: string, outputJpg: string, atSec: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, [
      "-y",
      "-ss",
      String(atSec),
      "-i",
      inputVideo,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      outputJpg,
    ], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (c) => (stderr += c.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg thumbnail exit ${code}: ${stderr.slice(-500)}`));
    });
  });
}

async function failRendition(renditionId: string, message: string) {
  await prisma.rendition.update({
    where: { id: renditionId },
    data: {
      status: "FAILED",
      errorMessage: message,
      finishedAt: new Date(),
    },
  });
}

async function recomputeJobStatus(jobId: string) {
  const counts = await prisma.rendition.groupBy({
    by: ["status"],
    where: { jobId },
    _count: true,
  });
  const byStatus = new Map(counts.map((c) => [c.status, c._count]));
  const total = counts.reduce((sum, c) => sum + c._count, 0);
  const done = byStatus.get("DONE") ?? 0;
  const failed = byStatus.get("FAILED") ?? 0;
  const finished = done + failed;

  if (finished < total) return; // masih proses

  const nextStatus =
    done === total
      ? "COMPLETED"
      : done === 0
        ? "FAILED"
        : "PARTIAL"; // sebagian sukses
  await prisma.job.update({
    where: { id: jobId },
    data: { status: nextStatus, completedAt: new Date() },
  });
}
