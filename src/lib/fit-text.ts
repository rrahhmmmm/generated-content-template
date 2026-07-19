import type opentype from "opentype.js";
import type { TextConfig } from "@/types/template-layout";

export type FitResult = {
  fontSize: number;
  lines: string[];
  truncated: boolean;
};

// Ukur lebar teks pada fontSize tertentu, dalam pixel.
function measure(font: opentype.Font, text: string, fontSize: number): number {
  return font.getAdvanceWidth(text, fontSize);
}

// Word-wrap greedy: masukkan kata ke baris berjalan selama lebar teks + spasi masih
// muat di dalam innerW; kalau meluber, mulai baris baru. Kata yang lebih panjang dari
// innerW dipotong secara paksa per-karakter agar tidak infinite loop.
export function wrapByWord(
  font: opentype.Font,
  text: string,
  fontSize: number,
  innerW: number
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  const fits = (s: string) => measure(font, s, fontSize) <= innerW;

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (fits(candidate)) {
      current = candidate;
      continue;
    }
    // Kata sendiri tidak muat — potong per karakter.
    if (!fits(word)) {
      if (current) lines.push(current);
      current = "";
      let chunk = "";
      for (const ch of word) {
        const next = chunk + ch;
        if (fits(next)) {
          chunk = next;
        } else {
          if (chunk) lines.push(chunk);
          chunk = ch;
        }
      }
      current = chunk;
      continue;
    }
    // Kata muat sendirian tapi kombinasinya meluber — commit baris lama.
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

export function fitText(
  font: opentype.Font,
  raw: string,
  cfg: TextConfig
): FitResult {
  const text = cfg.uppercase ? raw.toUpperCase() : raw;
  const innerW = cfg.box.w - cfg.padding.left - cfg.padding.right;
  const innerH = cfg.box.h - cfg.padding.top - cfg.padding.bottom;

  const step = 2;
  for (let size = cfg.fontSize; size >= cfg.minFontSize; size -= step) {
    const lines = wrapByWord(font, text, size, innerW);
    const needed = lines.length * size * cfg.lineHeight;
    if (lines.length <= cfg.maxLines && needed <= innerH) {
      return { fontSize: size, lines, truncated: false };
    }
  }

  // Semua ukuran gagal — potong di batas baris pada ukuran terkecil.
  const lines = wrapByWord(font, text, cfg.minFontSize, innerW).slice(0, cfg.maxLines);
  return { fontSize: cfg.minFontSize, lines, truncated: true };
}

// Y baseline untuk setiap baris.
// x, y adalah top-left dari inner content box.
// Baseline baris ke-n (0-indexed) = y + (n * fontSize * lineHeight) + ascent
// Karena kita render di canvas dengan textBaseline='alphabetic' (default), butuh
// ascent — di sini kita sederhanakan pakai fontSize * 0.85 sebagai perkiraan.
// Untuk FFmpeg drawtext, y = top-left dari baris (drawtext memakai baseline berbeda,
// tapi visualnya konsisten karena kita pakai posisi top-left yang sama).
export function lineOrigin(
  cfg: TextConfig,
  fontSize: number,
  lineIndex: number
): { x: number; y: number } {
  const y = cfg.box.y + cfg.padding.top + lineIndex * fontSize * cfg.lineHeight;
  const x = cfg.box.x + cfg.padding.left; // valid untuk align 'left'; align lain butuh lebar baris
  return { x, y };
}
