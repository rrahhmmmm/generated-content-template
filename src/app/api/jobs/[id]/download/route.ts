import { ZipArchive } from "archiver";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";

// Stream ZIP semua rendition DONE (plan.md §9). Nama file dalam ZIP pakai
// handle akun + jobId supaya user gampang identify.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      renditions: {
        where: { status: "DONE", outputKey: { not: null } },
        include: { account: { select: { handle: true } } },
      },
    },
  });
  if (!job) return new Response("Not found", { status: 404 });
  if (job.renditions.length === 0) {
    return new Response("Belum ada rendition selesai", { status: 409 });
  }

  const s = storage();
  const shortId = job.id.slice(-6);

  const encoder = new ReadableStream<Uint8Array>({
    start(controller) {
      const archive = new ZipArchive({ zlib: { level: 6 } });
      archive.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      archive.on("end", () => controller.close());
      archive.on("error", (err: Error) => controller.error(err));

      (async () => {
        // File caption index (satu file txt yang berisi semua caption per akun)
        const captionLines: string[] = [];
        for (const r of job.renditions) {
          if (!r.outputKey) continue;
          const obj = await s.get(r.outputKey);
          if (!obj) continue;
          const handle = r.account.handle.replace(/[^a-z0-9._-]+/gi, "_");
          archive.append(obj.buffer, { name: `${handle}.mp4` });

          // Thumbnail per akun (Fase 5: sudah unik per akun kalau di-generate pre-job)
          if (r.thumbnailKey) {
            const thumb = await s.get(r.thumbnailKey);
            if (thumb) {
              archive.append(thumb.buffer, { name: `${handle}_thumb.jpg` });
            }
          }

          captionLines.push(`=== ${r.account.handle} ===`);
          captionLines.push(`Thumbnail: ${r.thumbText ?? ""}`);
          captionLines.push(`Caption:`);
          captionLines.push(r.caption ?? "");
          captionLines.push("");
        }
        archive.append(captionLines.join("\n"), { name: "captions.txt" });
        await archive.finalize();
      })().catch((err) => controller.error(err));
    },
  });

  return new Response(encoder, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="job-${shortId}.zip"`,
    },
  });
}
