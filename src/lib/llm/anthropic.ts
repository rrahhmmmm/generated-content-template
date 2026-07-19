import { generateObject } from "ai";
import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
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

const DEFAULT_MODEL = "claude-sonnet-4-6";

// Provider #1: Anthropic direct via ANTHROPIC_API_KEY.
export class AnthropicDirectProvider implements LLMProvider {
  readonly id = "anthropic-direct";
  readonly model: string;
  private client: ReturnType<typeof anthropic>;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY belum di-set.");
    }
    this.model = process.env.LLM_MODEL || DEFAULT_MODEL;
    const provider = createAnthropic({ apiKey });
    this.client = provider(this.model);
  }

  async rewriteBatch(
    input: RewriteBatchInput,
    prompt: ComposedPrompt
  ): Promise<RewriteBatchOutput> {
    return runBatch(this.client, this.id, this.model, input, prompt);
  }
}

// Provider #2: Vercel AI Gateway (routing via 'anthropic/claude-sonnet-4-6'
// string). API key = AI_GATEWAY_API_KEY. Butuh `ai` v6+.
export class AnthropicGatewayProvider implements LLMProvider {
  readonly id = "anthropic-gateway";
  readonly model: string;
  private modelString: string;

  constructor() {
    const apiKey = process.env.AI_GATEWAY_API_KEY;
    if (!apiKey) throw new Error("AI_GATEWAY_API_KEY belum di-set.");
    this.model = process.env.LLM_MODEL || DEFAULT_MODEL;
    // Format gateway: '<provider>/<model>'. Lihat vercel.md gateway.
    this.modelString = `anthropic/${this.model}`;
    // Gateway API key dibaca oleh SDK dari env AI_GATEWAY_API_KEY otomatis.
  }

  async rewriteBatch(
    input: RewriteBatchInput,
    prompt: ComposedPrompt
  ): Promise<RewriteBatchOutput> {
    return runBatch(this.modelString, this.id, this.model, input, prompt);
  }
}

async function runBatch(
  model: Parameters<typeof generateObject>[0]["model"],
  id: string,
  modelName: string,
  input: RewriteBatchInput,
  prompt: ComposedPrompt
): Promise<RewriteBatchOutput> {
  const started = Date.now();
  try {
    const { object } = await generateObject({
      model,
      schema: responseSchema,
      system: prompt.system,
      prompt: prompt.user,
    });
    return {
      items: validateAndFallback(input, object.results),
      provider: id,
      model: modelName,
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    console.error(`[llm/${id}] gagal, fallback ke teks asli:`, err);
    return {
      items: validateAndFallback(input, []),
      provider: id,
      model: modelName,
      latencyMs: Date.now() - started,
    };
  }
}
