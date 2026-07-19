import { generateObject } from "ai";
import { google, createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import type { LLMProvider, RewriteBatchInput, RewriteBatchOutput } from "./index";
import type { ComposedPrompt } from "./prompt";
import { validateAndFallback } from "./validation";

const responseSchema = z.object({
  results: z.array(
    z.object({
      accountId: z.string(),
      caption: z.string(),
      thumbText: z.string(),
    })
  ),
});

// Google Gemini free tier — dapatkan API key di https://aistudio.google.com/apikey
// Default model: gemini-2.5-flash (15 RPM free, native JSON structured output)
export class GeminiProvider implements LLMProvider {
  readonly id = "gemini";
  readonly model: string;
  private client: ReturnType<typeof google>;

  constructor() {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GOOGLE_GENERATIVE_AI_API_KEY belum di-set. Ambil gratis di https://aistudio.google.com/apikey"
      );
    }
    // Default model — bisa di-override via LLM_MODEL env. Model list terbaru:
    // https://ai.google.dev/gemini-api/docs/models
    // Note (2026): API key baru punya quota 0 di gemini-2.5-flash dan gemini-2.0-flash
    // di free tier. `gemini-flash-lite-latest` masih tersedia gratis untuk key baru.
    this.model = process.env.LLM_MODEL || "gemini-flash-lite-latest";
    const provider = createGoogleGenerativeAI({ apiKey });
    this.client = provider(this.model);
  }

  async rewriteBatch(
    input: RewriteBatchInput,
    prompt: ComposedPrompt
  ): Promise<RewriteBatchOutput> {
    const started = Date.now();
    try {
      const { object } = await generateObject({
        model: this.client,
        schema: responseSchema,
        system: prompt.system,
        prompt: prompt.user,
      });
      const items = validateAndFallback(input, object.results);
      return {
        items,
        provider: this.id,
        model: this.model,
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      // Total fallback: LLM gagal → semua akun pakai teks asli
      console.error("[llm/gemini] gagal, fallback ke teks asli:", err);
      const items = validateAndFallback(input, []);
      return {
        items,
        provider: this.id,
        model: this.model,
        latencyMs: Date.now() - started,
      };
    }
  }
}
