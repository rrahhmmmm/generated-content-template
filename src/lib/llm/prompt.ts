import type { RewriteBatchInput } from "./index";
import { MAX_THUMB_WORDS } from "./index";
import type { PromptConfig } from "@/lib/prompt-config";
import { platformStyle } from "@/lib/prompt-config";

// Layered prompt: system (global) → per-platform block → per-account line.
// Semua bisa diedit di /settings; bagian yang kosong di-skip supaya prompt
// tidak berisik dengan header kosong.

export type ComposedPrompt = { system: string; user: string };

// Per-akun override (Account.promptStyle) di-inject di user prompt supaya
// setiap request LLM lihat instruksinya berdampingan dengan handle+platform.
export type AccountPromptOverrides = Map<string, string | null>;

export function buildPrompt(
  input: RewriteBatchInput,
  config: PromptConfig,
  accountStyles: AccountPromptOverrides
): ComposedPrompt {
  const usedPlatforms = new Set(input.accounts.map((a) => a.platform));

  const systemParts: string[] = [config.systemPrompt.trim()];

  const platformBlocks: string[] = [];
  if (usedPlatforms.has("TIKTOK") && config.tiktokStyle.trim())
    platformBlocks.push(`TIKTOK: ${config.tiktokStyle.trim()}`);
  if (usedPlatforms.has("INSTAGRAM") && config.instagramStyle.trim())
    platformBlocks.push(`INSTAGRAM: ${config.instagramStyle.trim()}`);
  if (usedPlatforms.has("YOUTUBE") && config.youtubeStyle.trim())
    platformBlocks.push(`YOUTUBE: ${config.youtubeStyle.trim()}`);
  if (platformBlocks.length > 0) {
    systemParts.push("");
    systemParts.push("Gaya per platform:");
    for (const b of platformBlocks) systemParts.push(`- ${b}`);
  }

  systemParts.push("");
  systemParts.push(
    `Aturan output global: thumbText WAJIB maksimum ${MAX_THUMB_WORDS} kata (word count, bukan karakter), tanpa emoji.`
  );

  const userLines: string[] = [];
  if (input.mode === "generate") {
    userLines.push(
      "Tugas: BUAT caption + thumbText untuk setiap akun berdasarkan deskripsi video di bawah.",
      "Gunakan systemPrompt + gaya platform + gaya per-akun sebagai panduan gaya bahasa.",
      "",
      "Deskripsi video:",
      input.description,
    );
  } else {
    userLines.push(
      "Tugas: TULIS ULANG caption + thumbText per akun agar variatif tapi mempertahankan inti pesan.",
      "",
      `Caption asli: ${input.baseCaption}`,
      `Thumbnail asli: ${input.baseThumbText}`,
    );
  }
  userLines.push("", "Akun:");
  for (const a of input.accounts) {
    const style = accountStyles.get(a.accountId)?.trim();
    const plStyle = platformStyle(config, a.platform).trim();
    const parts = [
      `accountId=${a.accountId}`,
      `handle=${a.handle}`,
      `platform=${a.platform}`,
    ];
    if (style) parts.push(`gaya khusus: ${style}`);
    if (!style && plStyle) parts.push(`gaya platform: ${plStyle}`);
    userLines.push(`- ${parts.join(" | ")}`);
  }
  userLines.push("");
  userLines.push(
    `Balas JSON dengan bentuk: {"results":[{"accountId":"...","caption":"...","thumbText":"..."}]}`
  );
  userLines.push(
    `Harus ada tepat ${input.accounts.length} elemen results, satu per accountId di atas.`
  );
  userLines.push(
    `Ingat: thumbText ≤ ${MAX_THUMB_WORDS} kata.`
  );

  return { system: systemParts.join("\n"), user: userLines.join("\n") };
}
