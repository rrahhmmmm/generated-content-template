import type { TemplateLayout } from "@/types/template-layout";
import { fitText, type FitResult } from "@/lib/fit-text";
import type opentype from "opentype.js";

// FFmpeg filter_complex builder — plan.md §5.
//
// Kontrak layer (bawah → atas):
//   [0:v] video sumber, di-scale + crop ke canvas
//   [1:v] frame PNG (seluruh durasi)
//   [2:v] intro PNG + drawtext (jika intro !== null; window 0..endSec)
//
// `enable='lt(t,END)'` WAJIB ada di setiap drawtext (plan.md §11). Kartu tanpa teks
// yang di-enable jadi kartunya hilang di detik 5 tapi teks menempel sampai akhir.

export type BuildFilterInput = {
  layout: TemplateLayout;
  fontPath: string;       // path absolut ke .ttf (dipakai fontfile= FFmpeg)
  textLinesDir: string;   // direktori absolut yang berisi l1.txt, l2.txt, ...
  fit: FitResult;         // hasil fitText yang sudah dihitung
  font: opentype.Font;    // untuk pengukuran lebar per baris (align center/right)
};

export type BuildFilterOutput = {
  filterComplex: string;
  hasIntro: boolean;
  drawtextCount: number;
};

export function buildFilterComplex(inp: BuildFilterInput): BuildFilterOutput {
  const { layout, fontPath, textLinesDir, fit, font } = inp;
  const { width: cw, height: ch } = layout.canvas;

  const parts: string[] = [];

  // 1. Video → scale + crop ke canvas
  parts.push(
    `[0:v]scale=${cw}:${ch}:force_original_aspect_ratio=increase,crop=${cw}:${ch},setsar=1[vid]`
  );

  // 2. Frame overlay (input 1)
  parts.push(`[vid][1:v]overlay=0:0[framed]`);

  const intro = layout.intro;
  if (!intro) {
    // Tidak ada intro — chain berakhir di [framed]. Beri label [out] agar map konsisten.
    parts.push(`[framed]null[out]`);
    return { filterComplex: parts.join(";"), hasIntro: false, drawtextCount: 0 };
  }

  const endT = intro.endSec;
  const fadeStart = Math.max(0, endT - intro.fadeOutSec);
  const enable = `lt(t,${endT})`;

  // 3. Intro PNG + fade out alpha, overlay pada window 0..endT
  parts.push(
    `[2:v]format=rgba,fade=t=out:st=${fadeStart}:d=${intro.fadeOutSec}:alpha=1[card]`
  );
  parts.push(`[framed][card]overlay=0:0:enable='${enable}'[carded]`);

  // 4. drawtext per baris
  const cfg = intro.text;
  const drawtexts: string[] = [];
  for (let i = 0; i < fit.lines.length; i++) {
    const line = fit.lines[i];
    const y = Math.round(cfg.box.y + cfg.padding.top + i * fit.fontSize * cfg.lineHeight);

    let x: number;
    if (cfg.align === "left") {
      x = cfg.box.x + cfg.padding.left;
    } else if (cfg.align === "center") {
      const lw = font.getAdvanceWidth(line, fit.fontSize);
      x = Math.round(cfg.box.x + (cfg.box.w - lw) / 2);
    } else {
      const lw = font.getAdvanceWidth(line, fit.fontSize);
      x = Math.round(cfg.box.x + cfg.box.w - cfg.padding.right - lw);
    }

    const textfile = `${textLinesDir}/l${i + 1}.txt`;
    const args = [
      `fontfile=${escapeArg(fontPath)}`,
      `textfile=${escapeArg(textfile)}`,
      `x=${x}`,
      `y=${y}`,
      `fontsize=${fit.fontSize}`,
      `fontcolor=${cfg.color}`,
      `enable='${enable}'`,
    ];
    if (cfg.shadow) {
      // shadow di-render dengan drawtext terpisah dulu, di bawahnya (drawtext order = layer)
      const sy = y + cfg.shadow.y;
      const sx = x + cfg.shadow.x;
      const shadowArgs = [
        `fontfile=${escapeArg(fontPath)}`,
        `textfile=${escapeArg(textfile)}`,
        `x=${sx}`,
        `y=${sy}`,
        `fontsize=${fit.fontSize}`,
        `fontcolor=${cfg.shadow.color}`,
        `enable='${enable}'`,
      ];
      drawtexts.push(`drawtext=${shadowArgs.join(":")}`);
    }
    drawtexts.push(`drawtext=${args.join(":")}`);
  }

  if (drawtexts.length === 0) {
    parts.push(`[carded]null[out]`);
  } else {
    parts.push(`[carded]${drawtexts.join(",")}[out]`);
  }

  return {
    filterComplex: parts.join(";"),
    hasIntro: true,
    drawtextCount: drawtexts.length,
  };
}

// Escape untuk nilai option di dalam filtergraph. FFmpeg mem-parse ':' sebagai separator,
// backslash sebagai escape, dan tanda kutip tunggal untuk grouping. Untuk PATH file
// (fontfile, textfile), yang paling penting adalah escape ':'.
function escapeArg(value: string): string {
  // Escape backslash dulu, lalu ':', lalu tanda kutip tunggal.
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(":", "\\:")
    .replaceAll("'", "\\'");
}

// Fit + build helper — bahasa lebih tinggi supaya render.ts tidak perlu tahu detail.
export function computeIntroFit(
  font: opentype.Font,
  raw: string,
  layout: TemplateLayout
): FitResult | null {
  if (!layout.intro) return null;
  return fitText(font, raw, layout.intro.text);
}
