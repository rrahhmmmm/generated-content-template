// TemplateLayout — plan.md §4.
// Semua koordinat pixel absolut pada kanvas 1080×1920.
// Video adalah base layer full-bleed (tidak ada videoRect).

export type TemplateLayout = {
  canvas: { width: number; height: number };
  videoFit: "cover";
  frame: { overlayKey: string };
  intro: IntroCard | null; // null = akun tanpa kartu intro
};

export type IntroCard = {
  overlayKey: string;
  startSec: number;
  endSec: number;
  fadeOutSec: number;

  text: TextConfig;
};

export type TextConfig = {
  box: { x: number; y: number; w: number; h: number };
  padding: { top: number; right: number; bottom: number; left: number };

  fontFile: string;
  fontSize: number;
  minFontSize: number;
  lineHeight: number; // multiplier
  color: string;
  align: "left" | "center" | "right";
  uppercase: boolean;
  maxLines: number;
  shadow?: { color: string; x: number; y: number };
};

export const DEFAULT_LAYOUT: TemplateLayout = {
  canvas: { width: 1080, height: 1920 },
  videoFit: "cover",
  frame: { overlayKey: "" },
  intro: {
    overlayKey: "",
    startSec: 0,
    endSec: 5,
    fadeOutSec: 0.3,
    text: {
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
    },
  },
};
