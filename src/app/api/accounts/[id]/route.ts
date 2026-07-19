import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { PLATFORMS } from "@/lib/platforms";

const patchSchema = z.object({
  handle: z.string().trim().min(2).max(64).optional(),
  platform: z.enum(PLATFORMS).optional(),
  displayName: z.string().trim().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const account = await prisma.account.findUnique({
    where: { id },
    include: { template: true },
  });
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(account);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const updated = await prisma.account.update({ where: { id }, data: parsed.data });
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return NextResponse.json({ error: "Handle sudah dipakai" }, { status: 409 });
    }
    if (err instanceof Error && err.message.includes("Record to update not found")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await prisma.account.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
