import type { Platform } from "@/lib/platforms";
import type { ComposedPrompt } from "./prompt";

// Kontrak LLM provider — abstraksi supaya bisa swap Gemini ↔ Anthropic tanpa
// menyentuh worker code. Semua provider harus menjamin per-account fallback:
// kalau hasil untuk satu accountId invalid, isi dengan teks asli. Job tidak
// pernah gagal gara-gara LLM (plan.md §6).

export type RewriteAccountInput = {
  accountId: string;
  handle: string;
  platform: Platform;
  maxThumbChars: number;
};

export type RewriteBatchInput = {
  baseCaption: string;
  baseThumbText: string;
  accounts: RewriteAccountInput[];
};

export type RewriteBatchItem = {
  accountId: string;
  caption: string;
  thumbText: string;
  fellBack: boolean;
};

export type RewriteBatchOutput = {
  items: RewriteBatchItem[];
  provider: string;
  model: string;
  latencyMs: number;
};

export interface LLMProvider {
  readonly id: string;
  readonly model: string;
  // Prompt di-compose oleh caller (process-job) supaya provider stateless dan
  // tidak perlu tahu tentang DB config. Lihat src/lib/llm/prompt.ts.
  rewriteBatch(input: RewriteBatchInput, prompt: ComposedPrompt): Promise<RewriteBatchOutput>;
}

// Factory: pilih provider dari env. Default gemini.
let cached: LLMProvider | null = null;

export async function llm(): Promise<LLMProvider> {
  if (cached) return cached;
  const provider = process.env.LLM_PROVIDER ?? "gemini";
  try {
    if (provider === "null") {
      const { NullLLMProvider } = await import("./null");
      cached = new NullLLMProvider();
    } else if (provider === "gemini") {
      const { GeminiProvider } = await import("./gemini");
      cached = new GeminiProvider();
    } else if (provider === "anthropic-gateway") {
      const { AnthropicGatewayProvider } = await import("./anthropic");
      cached = new AnthropicGatewayProvider();
    } else if (provider === "anthropic-direct") {
      const { AnthropicDirectProvider } = await import("./anthropic");
      cached = new AnthropicDirectProvider();
    } else {
      throw new Error(`LLM_PROVIDER tidak dikenal: ${provider}`);
    }
  } catch (err) {
    // Kalau key belum di-set (mis. GOOGLE_GENERATIVE_AI_API_KEY kosong), auto
    // fallback ke NullLLMProvider supaya pipeline masih bisa dites end-to-end.
    console.warn(`[llm] provider '${provider}' gagal init, fallback ke NullLLMProvider:`, err instanceof Error ? err.message : err);
    const { NullLLMProvider } = await import("./null");
    cached = new NullLLMProvider();
  }
  return cached;
}
