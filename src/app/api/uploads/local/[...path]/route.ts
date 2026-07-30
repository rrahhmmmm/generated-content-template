import { NextResponse } from "next/server";
import { storage } from "@/lib/storage";
import { assertUser } from "@/lib/auth/session";

// Dev-only file server untuk LocalStorageAdapter.
// Di produksi (STORAGE_DRIVER=r2), R2 melayani langsung via R2_PUBLIC_URL.
// Di-gate `requireUser` supaya file di ./storage/ tidak publik walau path ditebak.

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const gate = await assertUser();
  if (gate) return gate;
  const { path } = await ctx.params;
  const key = path.join("/");
  const obj = await storage().get(key);
  if (!obj) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(obj.buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "content-type": obj.contentType,
      // Private karena route sudah auth-gated. Jangan cache public/CDN.
      "cache-control": "private, max-age=3600",
    },
  });
}
