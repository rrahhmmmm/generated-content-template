import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { storage } from "@/lib/storage";
import { probeDuration } from "@/lib/render";

const MAX_BYTES = 200 * 1024 * 1024; // 200 MB — batas Next.js untuk upload langsung
const ALLOWED = new Set(["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"]);

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file field required" }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: `Content-type tidak didukung: ${file.type}` }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Video terlalu besar (>200MB)" }, { status: 413 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
  const key = `sources/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
  const stored = await storage().put(key, buffer, file.type);

  // Probe duration lewat tmp file (ffprobe butuh path filesystem)
  let duration: number | null = null;
  const tmpPath = path.join(os.tmpdir(), `probe-${crypto.randomUUID()}.${ext}`);
  try {
    await fs.writeFile(tmpPath, buffer);
    duration = await probeDuration(tmpPath);
  } catch {
    // probe gagal bukan error fatal — user tetap bisa submit; thumbnail generator akan skip.
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }

  return NextResponse.json({
    key: stored.key,
    url: storage().getPublicUrl(stored.key),
    size: stored.size,
    contentType: stored.contentType,
    duration,
  });
}
