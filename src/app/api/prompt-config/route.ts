import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { loadPromptConfig } from "@/lib/prompt-config";

const bodySchema = z.object({
  systemPrompt: z.string().trim().min(10).max(10000),
  tiktokStyle: z.string().max(5000).default(""),
  instagramStyle: z.string().max(5000).default(""),
  youtubeStyle: z.string().max(5000).default(""),
});

export async function GET() {
  const config = await loadPromptConfig();
  return NextResponse.json(config);
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const row = await prisma.promptConfig.upsert({
    where: { id: "global" },
    update: parsed.data,
    create: { id: "global", ...parsed.data },
  });
  return NextResponse.json({
    systemPrompt: row.systemPrompt,
    tiktokStyle: row.tiktokStyle,
    instagramStyle: row.instagramStyle,
    youtubeStyle: row.youtubeStyle,
  });
}
