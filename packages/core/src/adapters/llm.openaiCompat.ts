import { z } from "zod";
import type { LlmPort } from "../ports.js";

export interface LlmProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface OpenAiCompatOptions {
  primary: LlmProviderConfig;
  fallback?: LlmProviderConfig | undefined;
  timeoutMs?: number;
  reasoningEffort?: string | undefined;
  retryDelayMs?: number;
  fetchImpl?: typeof fetch;
}

export class LlmRequestError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "LlmRequestError";
  }
}

interface ChatResponse {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Plain fetch against any OpenAI-compatible /chat/completions endpoint.
 * 20s timeout, one retry on 429/5xx, then the fallback provider. It never
 * logs the summary, paths or model output.
 */
export class OpenAiCompatLlm implements LlmPort {
  private readonly timeoutMs: number;
  private readonly retryDelayMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OpenAiCompatOptions) {
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.retryDelayMs = options.retryDelayMs ?? 1_500;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async json<T>(args: {
    system: string;
    user: string;
    schemaName: string;
    schema: z.ZodType<T>;
    maxTokens?: number;
  }): Promise<{ data: T; provider: string; model: string }> {
    const providers = [this.options.primary, this.options.fallback].filter(
      (provider): provider is LlmProviderConfig =>
        provider !== undefined && provider.apiKey.length > 0,
    );
    if (providers.length === 0) {
      throw new LlmRequestError("no LLM provider is configured");
    }

    let lastError: unknown = new LlmRequestError("no LLM provider answered");
    for (const provider of providers) {
      try {
        const data = await this.call(provider, args);
        return { data, provider: providerName(provider.baseUrl), model: provider.model };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  private async call<T>(
    provider: LlmProviderConfig,
    args: {
      system: string;
      user: string;
      schemaName: string;
      schema: z.ZodType<T>;
      maxTokens?: number;
    },
  ): Promise<T> {
    let withReasoning = this.options.reasoningEffort !== undefined;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const body: Record<string, unknown> = {
        model: provider.model,
        temperature: 0,
        max_tokens: args.maxTokens ?? 2000,
        messages: [
          { role: "system", content: args.system },
          { role: "user", content: args.user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: args.schemaName,
            strict: true,
            schema: z.toJSONSchema(args.schema),
          },
        },
      };
      if (withReasoning && this.options.reasoningEffort) {
        body.reasoning_effort = this.options.reasoningEffort;
      }

      const response = await this.fetchImpl(
        `${provider.baseUrl.replace(/\/$/, "")}/chat/completions`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${provider.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      );

      if (response.status === 400 && withReasoning) {
        // Some providers reject reasoning_effort on structured outputs.
        withReasoning = false;
        continue;
      }

      if (response.status === 429 || response.status >= 500) {
        if (attempt === 0) {
          await sleep(this.retryDelayMs);
          continue;
        }
        throw new LlmRequestError(`provider returned ${response.status}`, response.status);
      }

      if (!response.ok) {
        throw new LlmRequestError(`provider returned ${response.status}`, response.status);
      }

      const payload = (await response.json()) as ChatResponse;
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.trim().length === 0) {
        throw new LlmRequestError("provider returned no content");
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new LlmRequestError("provider returned invalid JSON");
      }
      return args.schema.parse(parsed);
    }

    throw new LlmRequestError("provider rejected the request twice");
  }
}

function providerName(baseUrl: string): string {
  if (baseUrl.includes("groq")) return "groq";
  if (baseUrl.includes("openrouter")) return "openrouter";
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return "custom";
  }
}
