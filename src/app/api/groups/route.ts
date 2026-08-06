import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertUser } from "@/lib/auth/session";
import { GROUPS_CACHE_TAG } from "@/lib/groups";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional().nullable(),
  accountIds: z.array(z.string()).default([]),
});

export async function GET() {
  const gate = await assertUser();
  if (gate) return gate;
  const groups = await prisma.group.findMany({
    orderBy: { name: "asc" },
    include: {
      accounts: { select: { id: true } },
      _count: { select: { accounts: true } },
    },
  });
  return NextResponse.json(
    groups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      accountCount: g._count.accounts,
      accountIds: g.accounts.map((a) => a.id),
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    }))
  );
}

export async function POST(req: Request) {
  const gate = await assertUser();
  if (gate) return gate;
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.accountIds.length > 0) {
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

  try {
    const group = await prisma.group.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        accounts: parsed.data.accountIds.length > 0
          ? { connect: parsed.data.accountIds.map((id) => ({ id })) }
          : undefined,
      },
      include: { accounts: { select: { id: true } } },
    });
    revalidateTag(GROUPS_CACHE_TAG, { expire: 0 });
    return NextResponse.json(
      {
        id: group.id,
        name: group.name,
        description: group.description,
        accountIds: group.accounts.map((a) => a.id),
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return NextResponse.json({ error: "Nama group sudah dipakai" }, { status: 409 });
    }
    throw err;
  }
}
