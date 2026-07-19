import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { render } from "@/lib/render";
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

    // 3. Extract thumbnail (JPG) — dari detik 2 supaya kartu terlihat
    await extractThumbnail(outputPath, thumbnailPath, 2);

    // 4. Upload output + thumbnail ke storage
    const outKey = `renditions/${rendition.jobId}/${renditionId}/output.mp4`;
    const thumbKey = `renditions/${rendition.jobId}/${renditionId}/thumb.jpg`;

    const [outBuf, thumbBuf] = await Promise.all([
      fs.readFile(outputPath),
      fs.readFile(thumbnailPath),
    ]);

    await Promise.all([
      storage().put(outKey, outBuf, "video/mp4"),
      storage().put(thumbKey, thumbBuf, "image/jpeg"),
    ]);

    // 5. Update rendition + rekalkulasi status job
    await prisma.rendition.update({
      where: { id: renditionId },
      data: {
        status: "DONE",
        outputKey: outKey,
        thumbnailKey: thumbKey,
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
