import { NextResponse } from "next/server";
import { storage } from "@/lib/storage";

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
  return NextResponse.json({
    key: stored.key,
    url: storage().getPublicUrl(stored.key),
    size: stored.size,
    contentType: stored.contentType,
  });
}
