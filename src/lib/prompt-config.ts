import { prisma } from "@/lib/db";
import type { Platform } from "@/lib/platforms";

// Prompt config layered — semua dibaca dari DB. Kalau row belum ada, kita
// upsert dengan default text di bawah supaya /settings punya sesuatu untuk
// diedit dan LLM tetap dapat instruksi yang masuk akal.

export type PromptConfig = {
  systemPrompt: string;
  tiktokStyle: string;
  instagramStyle: string;
  youtubeStyle: string;
};

export const DEFAULT_SYSTEM_PROMPT = [
  "Kamu menulis ulang caption dan teks thumbnail untuk beberapa akun sosial media",
  "yang memposting konten sama. Inti pesan, fakta, angka, nama produk, dan call-to-action",
  "harus identik dengan versi asli. Yang berubah hanya susunan kalimat, pilihan kata,",
  "dan pembuka — supaya platform tidak mendeteksi konten duplikat.",
  "",
  "Aturan:",
  "- Jangan menambah klaim, angka, atau janji yang tidak ada di teks asli",
  "- Jangan menghapus informasi dari teks asli",
  "- Teks thumbnail maksimal sesuai maxChars per akun, tanpa emoji",
  "- Caption boleh pakai emoji dan hashtag kalau versi asli punya",
  "- Balas HANYA JSON valid sesuai schema, tanpa markdown fence, tanpa penjelasan",
].join("\n");

export const DEFAULT_TIKTOK_STYLE = "";
export const DEFAULT_INSTAGRAM_STYLE = "";
export const DEFAULT_YOUTUBE_STYLE = "";

export async function loadPromptConfig(): Promise<PromptConfig> {
  const row = await prisma.promptConfig.upsert({
    where: { id: "global" },
    update: {},
    create: {
      id: "global",
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      tiktokStyle: DEFAULT_TIKTOK_STYLE,
      instagramStyle: DEFAULT_INSTAGRAM_STYLE,
      youtubeStyle: DEFAULT_YOUTUBE_STYLE,
    },
  });
  return {
    systemPrompt: row.systemPrompt,
    tiktokStyle: row.tiktokStyle,
    instagramStyle: row.instagramStyle,
    youtubeStyle: row.youtubeStyle,
  };
}

export function platformStyle(config: PromptConfig, platform: Platform): string {
  if (platform === "TIKTOK") return config.tiktokStyle;
  if (platform === "INSTAGRAM") return config.instagramStyle;
  if (platform === "YOUTUBE") return config.youtubeStyle;
  return "";
}
