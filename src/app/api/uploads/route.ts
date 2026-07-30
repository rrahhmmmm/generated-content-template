import { NextResponse } from "next/server";
import { z } from "zod";
import { storage } from "@/lib/storage";
import { assertUser } from "@/lib/auth/session";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB — cukup untuk PNG template

const ALLOWED_CONTENT = new Set(["image/png", "image/jpeg", "image/webp"]);

const querySchema = z.object({
  prefix: z.string().min(1).max(64).regex(/^[a-z0-9\-\/]+$/i),
});

export async function POST(req: Request) {
  const gate = await assertUser();
  if (gate) return gate;
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({ prefix: url.searchParams.get("prefix") ?? "misc" });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid prefix" }, { status: 400 });
  }
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file field required" }, { status: 400 });
  }
  if (!ALLOWED_CONTENT.has(file.type)) {
    return NextResponse.json({ error: `Unsupported content-type: ${file.type}` }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File terlalu besar (>20MB)" }, { status: 413 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.type.split("/")[1] ?? "bin";
  const key = `${parsed.data.prefix}/${crypto.randomUUID()}.${ext}`;
  const stored = await storage().put(key, buffer, file.type);
  return NextResponse.json({
    key: stored.key,
    url: storage().getPublicUrl(stored.key),
    contentType: stored.contentType,
    size: stored.size,
  });
}
