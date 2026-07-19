import { describe, it, expect, beforeAll } from "vitest";
import type opentype from "opentype.js";
import { loadFont } from "@/lib/fonts";
import { fitText, wrapByWord } from "@/lib/fit-text";
import type { TextConfig } from "@/types/template-layout";

const cfg: TextConfig = {
  box: { x: 60, y: 975, w: 950, h: 310 },
  padding: { top: 40, right: 40, bottom: 40, left: 40 },
  fontFile: "Inter-Black.ttf",
  fontSize: 58,
  minFontSize: 40,
  lineHeight: 1.22,
  color: "#111111",
  align: "left",
  uppercase: true,
  maxLines: 5,
};

let font: opentype.Font;

beforeAll(async () => {
  font = await loadFont("Inter-Black.ttf");
});

describe("fitText", () => {
  it("teks pendek muat 1 baris pada fontSize ideal", () => {
    const r = fitText(font, "Halo", cfg);
    expect(r.lines).toHaveLength(1);
    expect(r.fontSize).toBe(cfg.fontSize);
    expect(r.truncated).toBe(false);
  });

  it("teks sedang tetap muat tanpa auto-shrink", () => {
    const r = fitText(font, "Sebelumnya apresiasi polri", cfg);
    expect(r.lines.length).toBeGreaterThanOrEqual(1);
    expect(r.lines.length).toBeLessThanOrEqual(cfg.maxLines);
    expect(r.fontSize).toBe(cfg.fontSize);
  });

  it("teks panjang shrink dan tetap dalam kotak", () => {
    const long =
      "Sebelumnya apresiasi polri penangkapan jampidsus oleh densus 88 anti teror di jakarta selatan hari ini";
    const r = fitText(font, long, cfg);
    expect(r.fontSize).toBeLessThan(cfg.fontSize);
    expect(r.fontSize).toBeGreaterThanOrEqual(cfg.minFontSize);
    expect(r.lines.length).toBeLessThanOrEqual(cfg.maxLines);
    expect(r.truncated).toBe(false);
  });

  it("teks super panjang dipotong dan ditandai truncated", () => {
    const superLong = Array(30)
      .fill("SEBELUMNYA APRESIASI POLRI PENANGKAPAN JAMPIDSUS")
      .join(" ");
    const r = fitText(font, superLong, cfg);
    expect(r.truncated).toBe(true);
    expect(r.lines.length).toBe(cfg.maxLines);
    expect(r.fontSize).toBe(cfg.minFontSize);
  });

  it("uppercase menghasilkan teks huruf besar", () => {
    const r = fitText(font, "halo", cfg);
    expect(r.lines[0]).toBe("HALO");
  });

  it("uppercase = false mempertahankan case asli", () => {
    const r = fitText(font, "Halo Dunia", { ...cfg, uppercase: false });
    expect(r.lines[0]).toBe("Halo Dunia");
  });
});

describe("wrapByWord", () => {
  it("kata yang lebih lebar dari innerW dipotong per karakter", () => {
    const lines = wrapByWord(font, "supercalifragilisticexpialidocious", 200, 400);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) {
      expect(font.getAdvanceWidth(l, 200)).toBeLessThanOrEqual(400);
    }
  });

  it("tiap baris tidak meluber lebar", () => {
    const lines = wrapByWord(
      font,
      "SEBELUMNYA APRESIASI POLRI PENANGKAPAN JAMPIDSUS",
      58,
      870
    );
    for (const l of lines) {
      expect(font.getAdvanceWidth(l, 58)).toBeLessThanOrEqual(870);
    }
  });
});
