import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { PLATFORMS } from "@/lib/platforms";
import { assertUser } from "@/lib/auth/session";

const createSchema = z.object({
  handle: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^@?[a-z0-9_.\-]+$/i, "Handle hanya huruf, angka, titik, garis bawah, atau strip"),
  platform: z.enum(PLATFORMS),
  displayName: z.string().trim().min(1).max(120),
});

export async function GET() {
  const gate = await assertUser();
  if (gate) return gate;
  const accounts = await prisma.account.findMany({
    orderBy: { createdAt: "desc" },
    include: { template: { select: { id: true, version: true, updatedAt: true } } },
  });
  return NextResponse.json(accounts);
}

export async function POST(req: Request) {
  const gate = await assertUser();
  if (gate) return gate;
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const handle = parsed.data.handle.startsWith("@") ? parsed.data.handle : `@${parsed.data.handle}`;
  try {
    const account = await prisma.account.create({
      data: { ...parsed.data, handle },
    });
    return NextResponse.json(account, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return NextResponse.json({ error: "Handle sudah dipakai" }, { status: 409 });
    }
    throw err;
  }
}
