import type { RewriteBatchInput } from "./index";
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

  const userLines: string[] = [
    `Caption asli: ${input.baseCaption}`,
    `Thumbnail asli: ${input.baseThumbText}`,
    "",
    "Akun:",
  ];
  for (const a of input.accounts) {
    const style = accountStyles.get(a.accountId)?.trim();
    // Sesuaikan gaya per platform juga di user prompt supaya LLM tidak lupa.
    const plStyle = platformStyle(config, a.platform).trim();
    const parts = [
      `accountId=${a.accountId}`,
      `handle=${a.handle}`,
      `platform=${a.platform}`,
      `thumbnail max ${a.maxThumbChars} karakter`,
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

  return { system: systemParts.join("\n"), user: userLines.join("\n") };
}
