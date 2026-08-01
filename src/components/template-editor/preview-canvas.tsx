"use client";

import { useEffect, useRef, useState } from "react";
import type opentype from "opentype.js";
import { loadFontClient } from "@/lib/fonts-client";
import { fitText } from "@/lib/fit-text";
import type { TemplateLayout } from "@/types/template-layout";

type Props = {
  layout: TemplateLayout;
  frameUrl: string | null;
  introUrl: string | null;
  sampleText: string;
  showIntro: boolean; // true = detik 2 (kartu + teks tampil); false = detik 10
  className?: string;
};

// Placeholder video "still" — gradient supaya user melihat area video terisi.
function drawVideoPlaceholder(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#3B3B45");
  grad.addColorStop(1, "#6E6E7A");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = "500 40px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("(video sumber)", w / 2, h / 2);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Gagal load: ${url}`));
    img.src = url;
  });
}

export function PreviewCanvas({
  layout,
  frameUrl,
  introUrl,
  sampleText,
  showIntro,
  className,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [font, setFont] = useState<opentype.Font | null>(null);
  const [frameImg, setFrameImg] = useState<HTMLImageElement | null>(null);
  const [introImg, setIntroImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  const fontFile = layout.intro?.text.fontFile ?? "Inter-Black.ttf";

  useEffect(() => {
    let alive = true;
    loadFontClient(fontFile).then(
      (f) => alive && setFont(f),
      (e) => alive && setError(e.message)
    );
    return () => {
      alive = false;
    };
  }, [fontFile]);

  useEffect(() => {
    let alive = true;
    if (frameUrl) {
      loadImage(frameUrl).then(
        (img) => alive && setFrameImg(img),
        () => alive && setFrameImg(null)
      );
    } else {
      setFrameImg(null);
    }
    return () => {
      alive = false;
    };
  }, [frameUrl]);

  useEffect(() => {
    let alive = true;
    if (introUrl) {
      loadImage(introUrl).then(
        (img) => alive && setIntroImg(img),
        () => alive && setIntroImg(null)
      );
    } else {
      setIntroImg(null);
    }
    return () => {
      alive = false;
    };
  }, [introUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = layout.canvas;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    // 1. Video placeholder
    drawVideoPlaceholder(ctx, width, height);

    // 2. Frame overlay (seluruh durasi)
    if (frameImg) {
      ctx.drawImage(frameImg, 0, 0, width, height);
    }

    // 3. Intro card + text (hanya di window 0–endSec)
    let localTruncated = false;
    if (showIntro && layout.intro) {
      if (introImg) {
        ctx.drawImage(introImg, 0, 0, width, height);
      }
      if (font) {
        const cfg = layout.intro.text;
        const fit = fitText(font, sampleText, cfg);
        localTruncated = fit.truncated;
        ctx.fillStyle = cfg.color;
        ctx.textBaseline = "top";
        // Ukur baris ke posisi text-baseline "top" agar top-left tetap konsisten dengan
        // rumus lineOrigin() yang dipakai FFmpeg drawtext.
        const innerX = cfg.box.x + cfg.padding.left;
        for (let i = 0; i < fit.lines.length; i++) {
          const line = fit.lines[i];
          const y = cfg.box.y + cfg.padding.top + i * fit.fontSize * cfg.lineHeight;
          let x = innerX;
          if (cfg.align !== "left") {
            const w = font.getAdvanceWidth(line, fit.fontSize);
            if (cfg.align === "center") x = cfg.box.x + (cfg.box.w - w) / 2;
            else x = cfg.box.x + cfg.box.w - cfg.padding.right - w;
          }
          if (cfg.shadow) {
            ctx.save();
            ctx.fillStyle = cfg.shadow.color;
            drawTextWithFont(ctx, font, line, x + cfg.shadow.x, y + cfg.shadow.y, fit.fontSize, cfg.color);
            ctx.restore();
          }
          drawTextWithFont(ctx, font, line, x, y, fit.fontSize, cfg.color);
        }
      }
    }
    setTruncated(localTruncated);
  }, [layout, frameImg, introImg, font, sampleText, showIntro]);

  return (
    <div className={className}>
      <div className="rounded-lg border border-border bg-black/5 dark:bg-black/40 p-3">
        <canvas
          ref={canvasRef}
          className="mx-auto block h-auto w-full max-w-[360px] rounded"
          style={{ aspectRatio: `${layout.canvas.width} / ${layout.canvas.height}` }}
        />
      </div>
      {error ? <p className="mt-2 text-caption text-danger">{error}</p> : null}
      {truncated ? (
        <p className="mt-2 text-caption text-warning">
          Teks terlalu panjang — dipotong di batas ukuran minimal.
        </p>
      ) : null}
    </div>
  );
}

// Render teks dari opentype glyphs supaya width sama persis dengan pengukuran fit-text.
// (Canvas built-in ctx.font butuh font terdaftar; opentype path render lebih portabel
// dan konsisten dengan hitungan getAdvanceWidth yang dipakai fitText.)
function drawTextWithFont(
  ctx: CanvasRenderingContext2D,
  font: opentype.Font,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  color: string
) {
  // opentype baseline = y + ascent
  const ascent = (font.ascender / font.unitsPerEm) * fontSize;
  const path = font.getPath(text, x, y + ascent, fontSize);
  path.fill = color;
  path.draw(ctx);
}
