#!/usr/bin/env tsx
// CLI: render dengan salah satu mode:
//   (a) --account <id|handle>    → tarik template dari DB + resolve file lewat storage adapter
//   (b) --layout <layout.json>   → baca layout JSON di filesystem + resolve PNG dari layout dir
//
// Membuktikan render pipeline bekerja tanpa queue/LLM (plan.md §10 Fase 2).

import path from "node:path";
import { promises as fs } from "node:fs";
import { render } from "../src/lib/render/index";
import { storage } from "../src/lib/storage/index";
import { prisma } from "../src/lib/db";
import type { TemplateLayout } from "../src/types/template-layout";

type Args = Record<string, string>;

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function usage(): never {
  console.error(
    `\nUsage:\n  pnpm render --source <video.mp4> --account <id|handle> --text "<...>" --out <out.mp4>` +
      `\n  pnpm render --source <video.mp4> --layout <layout.json> --text "<...>" --out <out.mp4>` +
      `\n\nOptional:\n  --frame <frame.png>   Override frame path` +
      `\n  --intro <intro.png>   Override intro path` +
      `\n  --font  <font.ttf>    Font path (default public/fonts/{layout.intro.text.fontFile})` +
      `\n  --work  <dir>         Work dir (default /tmp/render-<uid>)\n`
  );
  process.exit(1);
}

type Resolved = {
  layout: TemplateLayout;
  frameSource: string; // absolute path
  introSource: string | null;
  cleanupPaths: string[]; // temp files to unlink after render
  label: string;
};

async function materializeFromStorage(key: string, dest: string): Promise<void> {
  const obj = await storage().get(key);
  if (!obj) throw new Error(`Key tidak ditemukan di storage: ${key}`);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, obj.buffer);
}

async function resolveFromAccount(handleOrId: string, tmpDir: string): Promise<Resolved> {
  const idOrHandle = handleOrId.startsWith("@") ? handleOrId : `@${handleOrId}`;
  // Cari by id dulu, kalau tidak ada → by handle (auto-tambah @)
  let account = await prisma.account.findUnique({
    where: { id: handleOrId },
    include: { template: true },
  });
  if (!account) {
    account = await prisma.account.findUnique({
      where: { handle: idOrHandle },
      include: { template: true },
    });
  }
  if (!account) throw new Error(`Akun tidak ditemukan: ${handleOrId}`);
  if (!account.template) throw new Error(`Akun ${account.handle} belum punya template. Atur dulu di /accounts/${account.id}/template`);

  const layout = JSON.parse(account.template.layout) as TemplateLayout;

  // Tarik file dari storage → tulis ke temp
  await fs.mkdir(tmpDir, { recursive: true });
  const framePath = path.join(tmpDir, "frame.png");
  await materializeFromStorage(account.template.frameKey, framePath);

  let introPath: string | null = null;
  const cleanupPaths = [framePath];
  if (account.template.introKey) {
    introPath = path.join(tmpDir, "intro.png");
    await materializeFromStorage(account.template.introKey, introPath);
    cleanupPaths.push(introPath);
  }

  return {
    layout,
    frameSource: framePath,
    introSource: introPath,
    cleanupPaths,
    label: `${account.handle} (template v${account.template.version})`,
  };
}

async function resolveFromLayoutFile(layoutFile: string): Promise<Resolved> {
  const layoutPath = path.resolve(layoutFile);
  const layoutRaw = await fs.readFile(layoutPath, "utf8");
  const layout = JSON.parse(layoutRaw) as TemplateLayout;
  const layoutDir = path.dirname(layoutPath);
  return {
    layout,
    frameSource: path.resolve(layoutDir, layout.frame.overlayKey),
    introSource: layout.intro ? path.resolve(layoutDir, layout.intro.overlayKey) : null,
    cleanupPaths: [],
    label: `layout ${layoutFile}`,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const required = ["source", "text", "out"];
  for (const k of required) if (!args[k]) usage();
  if (!args.account && !args.layout) usage();
  if (args.account && args.layout) {
    console.error("Pilih salah satu: --account atau --layout (tidak dua-duanya)");
    process.exit(1);
  }

  const uid = Math.random().toString(36).slice(2, 8);
  const workDir = path.resolve(args.work ?? path.join("/tmp", `render-${uid}`));
  const tmpAssetsDir = path.join(workDir, "assets");

  const resolved = args.account
    ? await resolveFromAccount(args.account, tmpAssetsDir)
    : await resolveFromLayoutFile(args.layout);

  // Overrides
  const framePath = args.frame ? path.resolve(args.frame) : resolved.frameSource;
  const introPath = args.intro
    ? path.resolve(args.intro)
    : resolved.layout.intro
      ? resolved.introSource
      : null;
  const fontPath = path.resolve(
    args.font ??
      path.join(process.cwd(), "public/fonts", resolved.layout.intro?.text.fontFile ?? "Inter-Black.ttf")
  );
  const outPath = path.resolve(args.out);

  console.log("→ mode  :", args.account ? "account" : "layout file");
  console.log("→ target:", resolved.label);
  console.log("→ source:", args.source);
  console.log("→ frame :", framePath);
  console.log("→ intro :", introPath ?? "(none)");
  console.log("→ font  :", fontPath);
  console.log("→ work  :", workDir);
  console.log("→ out   :", outPath);
  console.log("→ text  :", JSON.stringify(args.text));
  console.log("");

  try {
    const r = await render({
      renditionId: uid,
      sourcePath: path.resolve(args.source),
      framePath,
      introPath,
      fontPath,
      layout: resolved.layout,
      thumbText: args.text,
      outputPath: outPath,
      workDir,
    });
    console.log("");
    console.log("✔ Render selesai dalam", r.durationMs, "ms");
    console.log("  fontSize:", r.fontSize);
    console.log("  lines   :", r.lines);
    console.log("  truncated:", r.truncated);
    console.log("  output  :", r.outputPath);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((err) => {
  console.error("✗ Render gagal:", err instanceof Error ? err.message : err);
  prisma.$disconnect().catch(() => {});
  process.exit(1);
});
