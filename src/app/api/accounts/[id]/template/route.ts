import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const boxSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
});

const paddingSchema = z.object({
  top: z.number().int().min(0),
  right: z.number().int().min(0),
  bottom: z.number().int().min(0),
  left: z.number().int().min(0),
});

const textSchema = z.object({
  box: boxSchema,
  padding: paddingSchema,
  fontFile: z.string().min(1),
  fontSize: z.number().int().min(8).max(400),
  minFontSize: z.number().int().min(8).max(400),
  lineHeight: z.number().min(0.8).max(3),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  align: z.enum(["left", "center", "right"]),
  uppercase: z.boolean(),
  maxLines: z.number().int().min(1).max(20),
  shadow: z
    .object({
      color: z.string(),
      x: z.number(),
      y: z.number(),
    })
    .optional(),
});

const introSchema = z
  .object({
    overlayKey: z.string().min(1),
    startSec: z.number().min(0),
    endSec: z.number().positive(),
    fadeOutSec: z.number().min(0),
    text: textSchema,
  })
  .nullable();

const layoutSchema = z.object({
  canvas: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
  videoFit: z.literal("cover"),
  frame: z.object({ overlayKey: z.string().min(1) }),
  intro: introSchema,
});

const bodySchema = z.object({
  frameKey: z.string().min(1),
  introKey: z.string().min(1).nullable(),
  layout: layoutSchema,
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const template = await prisma.template.findUnique({ where: { accountId: id } });
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ...template, layout: JSON.parse(template.layout) });
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const account = await prisma.account.findUnique({ where: { id }, select: { id: true } });
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const { frameKey, introKey, layout } = parsed.data;
  const layoutJson = JSON.stringify(layout);

  const existing = await prisma.template.findUnique({ where: { accountId: id } });

  const template = existing
    ? await prisma.template.update({
        where: { accountId: id },
        data: {
          frameKey,
          introKey,
          layout: layoutJson,
          width: layout.canvas.width,
          height: layout.canvas.height,
          version: { increment: 1 },
        },
      })
    : await prisma.template.create({
        data: {
          accountId: id,
          frameKey,
          introKey,
          layout: layoutJson,
          width: layout.canvas.width,
          height: layout.canvas.height,
        },
      });

  return NextResponse.json({ ...template, layout: JSON.parse(template.layout) });
}
