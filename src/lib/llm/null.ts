import type { LLMProvider, RewriteBatchInput, RewriteBatchOutput } from "./index";
import type { ComposedPrompt } from "./prompt";
import { validateAndFallback } from "./validation";

// Provider "null" — tidak memanggil LLM apapun, langsung pakai teks asli untuk
// semua akun. Berguna untuk:
// - Testing pipeline queue/render tanpa perlu API key
// - Fallback otomatis kalau GOOGLE_GENERATIVE_AI_API_KEY belum di-set
// - Rendering yang sengaja mempertahankan caption identik (mis. video dengan CTA fixed)
export class NullLLMProvider implements LLMProvider {
  readonly id = "null";
  readonly model = "identity";
  async rewriteBatch(input: RewriteBatchInput, _prompt: ComposedPrompt): Promise<RewriteBatchOutput> {
    return {
      items: validateAndFallback(input, []),
      provider: this.id,
      model: this.model,
      latencyMs: 0,
    };
  }
}
