import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertUser } from "@/lib/auth/session";

// Koordinat pixel boleh float — FFmpeg dan canvas render tetap benar (dibulatkan
// saat drawtext dibangun). Batasi hanya finite + non-negative.
const boxSchema = z.object({
  x: z.number().finite().min(0),
  y: z.number().finite().min(0),
  w: z.number().finite().positive(),
  h: z.number().finite().positive(),
});

const paddingSchema = z.object({
  top: z.number().finite().min(0),
  right: z.number().finite().min(0),
  bottom: z.number().finite().min(0),
  left: z.number().finite().min(0),
});

const textSchema = z.object({
  box: boxSchema,
  padding: paddingSchema,
  fontFile: z.string().min(1),
  fontSize: z.number().finite().min(8).max(400),
  minFontSize: z.number().finite().min(8).max(400),
  lineHeight: z.number().min(0.8).max(3),
  // Terima "#RGB" atau "#RRGGBB" (input color picker Safari kadang keluarkan
  // 3-char). Normalisasi di process rendering kalau perlu.
  color: z.string().regex(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i),
  align: z.enum(["left", "center", "right"]),
  uppercase: z.boolean(),
  maxLines: z.number().finite().min(1).max(20),
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
  const gate = await assertUser();
  if (gate) return gate;
  const { id } = await ctx.params;
  const template = await prisma.template.findUnique({ where: { accountId: id } });
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ...template, layout: JSON.parse(template.layout) });
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await assertUser();
  if (gate) return gate;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    // Build human-readable message: "layout.intro.text.fontSize: harus integer".
    const messages = parsed.error.issues.map((issue) => {
      const path = issue.path.join(".") || "(root)";
      return `${path}: ${issue.message}`;
    });
    const errorText = messages.join("; ");
    console.error("[PUT template] 400 untuk", id, "—", errorText);
    return NextResponse.json({ error: errorText, issues: parsed.error.flatten() }, { status: 400 });
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
