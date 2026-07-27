import { NextResponse } from "next/server";
import { storage } from "@/lib/storage";
import { assertUser } from "@/lib/auth/session";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const gate = await assertUser();
  if (gate) return gate;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file field required" }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: `Content-type tidak didukung: ${file.type}` },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Gambar terlalu besar (>${MAX_BYTES / 1e6} MB)` },
      { status: 413 }
    );
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const key = `thumbnails/uploaded/${new Date()
    .toISOString()
    .slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
  const stored = await storage().put(key, buffer, file.type);
  return NextResponse.json({
    key: stored.key,
    url: storage().getPublicUrl(stored.key),
    size: stored.size,
    contentType: stored.contentType,
  });
}
