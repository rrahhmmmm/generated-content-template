import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Health check untuk Railway. Cek DB connection alive supaya kalau Postgres
// down, deployment tidak di-mark healthy. Public (no auth) — middleware
// PUBLIC_PATHS harus include /api/healthz.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, ts: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 503 }
    );
  }
}
