import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin, HttpError } from "@/lib/auth/session";

const schema = z.object({
  action: z.enum(["APPROVE", "REJECT", "DEACTIVATE"]),
});

const ACTION_TO_STATUS = {
  APPROVE: "ACTIVE",
  REJECT: "REJECTED",
  DEACTIVATE: "REJECTED",
} as const;

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireAdmin();
  } catch (err) {
    if (err instanceof HttpError) return err.toResponse();
    throw err;
  }

  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { action } = parsed.data;

  if (session.userId === id && (action === "REJECT" || action === "DEACTIVATE")) {
    return NextResponse.json(
      { error: "Tidak bisa reject atau deactivate akun sendiri" },
      { status: 400 }
    );
  }

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!target) {
    return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { status: ACTION_TO_STATUS[action] },
    select: { id: true, status: true },
  });

  return NextResponse.json(updated);
}
