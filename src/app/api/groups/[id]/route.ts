import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertUser } from "@/lib/auth/session";
import { GROUPS_CACHE_TAG } from "@/lib/groups";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  accountIds: z.array(z.string()).optional(),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await assertUser();
  if (gate) return gate;
  const { id } = await ctx.params;
  const group = await prisma.group.findUnique({
    where: { id },
    include: {
      accounts: {
        select: { id: true, handle: true, displayName: true, platform: true, isActive: true },
        orderBy: { handle: "asc" },
      },
    },
  });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(group);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await assertUser();
  if (gate) return gate;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Kalau accountIds di-pass, validate exist dulu
  if (parsed.data.accountIds !== undefined && parsed.data.accountIds.length > 0) {
    const found = await prisma.account.findMany({
      where: { id: { in: parsed.data.accountIds } },
      select: { id: true },
    });
    if (found.length !== parsed.data.accountIds.length) {
      return NextResponse.json(
        { error: "Sebagian accountIds tidak ditemukan" },
        { status: 400 }
      );
    }
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  if (parsed.data.accountIds !== undefined) {
    // `set` menggantikan seluruh relasi — kosong array = unlink semua akun
    data.accounts = { set: parsed.data.accountIds.map((aid) => ({ id: aid })) };
  }

  try {
    const updated = await prisma.group.update({
      where: { id },
      data,
      include: { accounts: { select: { id: true } } },
    });
    revalidateTag(GROUPS_CACHE_TAG, { expire: 0 });
    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      description: updated.description,
      accountIds: updated.accounts.map((a) => a.id),
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return NextResponse.json({ error: "Nama group sudah dipakai" }, { status: 409 });
    }
    if (err instanceof Error && err.message.includes("Record to update not found")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await assertUser();
  if (gate) return gate;
  const { id } = await ctx.params;
  await prisma.group.delete({ where: { id } }).catch(() => null);
  revalidateTag(GROUPS_CACHE_TAG, { expire: 0 });
  return NextResponse.json({ ok: true });
}
