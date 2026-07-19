#!/usr/bin/env tsx
// CLI: pnpm render --source clip.mp4 --layout layouts/kicauonline.json \
//                  --frame frame.png --intro intro.png \
//                  --text "..." --out out.mp4
//
// Membuktikan render pipeline bekerja tanpa queue/db/LLM (plan.md §10 Fase 2).

import path from "node:path";
import { promises as fs } from "node:fs";
import { render } from "../src/lib/render/index";
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
    `\nUsage: pnpm render --source <video.mp4> --layout <layout.json> --text "<thumb text>" --out <out.mp4>` +
      `\n\nOptional:\n  --frame <frame.png>   Override frame path (default: dari layout dir + layout.frame.overlayKey)` +
      `\n  --intro <intro.png>   Override intro path (default: dari layout dir + layout.intro.overlayKey)` +
      `\n  --font  <font.ttf>    Path font (default: public/fonts/Inter-Black.ttf)` +
      `\n  --work  <dir>         Work dir (default: /tmp/render-<uid>)\n`
  );
  process.exit(1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const required = ["source", "layout", "text", "out"];
  for (const k of required) if (!args[k]) usage();

  const layoutPath = path.resolve(args.layout);
  const layoutRaw = await fs.readFile(layoutPath, "utf8");
  const layout = JSON.parse(layoutRaw) as TemplateLayout;
  const layoutDir = path.dirname(layoutPath);

  const framePath = path.resolve(args.frame ?? path.join(layoutDir, layout.frame.overlayKey));
  const introPath = layout.intro
    ? path.resolve(args.intro ?? path.join(layoutDir, layout.intro.overlayKey))
    : null;
  const fontPath = path.resolve(
    args.font ??
      path.join(process.cwd(), "public/fonts", layout.intro?.text.fontFile ?? "Inter-Black.ttf")
  );

  const uid = Math.random().toString(36).slice(2, 8);
  const workDir = path.resolve(args.work ?? path.join("/tmp", `render-${uid}`));
  const outPath = path.resolve(args.out);

  console.log("→ source:", args.source);
  console.log("→ layout:", args.layout);
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
      layout,
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
    // Bersihkan textfile agar reruns bersih
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((err) => {
  console.error("✗ Render gagal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
