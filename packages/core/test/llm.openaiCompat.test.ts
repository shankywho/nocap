import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { z } from "zod";
import { LlmRequestError, OpenAiCompatLlm } from "../src/adapters/llm.openaiCompat";

const schema = z.object({ answer: z.string() });
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const primary = {
  baseUrl: "https://api.groq.com/openai/v1",
  apiKey: "k1",
  model: "openai/gpt-oss-120b",
};
const fallback = {
  baseUrl: "https://openrouter.ai/api/v1",
  apiKey: "k2",
  model: "openai/gpt-oss-120b",
};

function llm(extra: Partial<ConstructorParameters<typeof OpenAiCompatLlm>[0]> = {}) {
  return new OpenAiCompatLlm({ primary, retryDelayMs: 0, ...extra });
}

describe("OpenAiCompatLlm", () => {
  it("sends a strict JSON-schema chat completion", async () => {
    let captured: Record<string, unknown> = {};
    server.use(
      http.post("https://api.groq.com/openai/v1/chat/completions", async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          choices: [
            { message: { content: JSON.stringify({ answer: "ok" }) }, finish_reason: "stop" },
          ],
        });
      }),
    );

    const result = await llm({ reasoningEffort: "low" }).json({
      system: "sys",
      user: "usr",
      schemaName: "claims",
      schema,
    });

    expect(result.data.answer).toBe("ok");
    expect(result.provider).toBe("groq");
    expect(captured.model).toBe("openai/gpt-oss-120b");
    expect(captured.temperature).toBe(0);
    expect(captured.reasoning_effort).toBe("low");
    const format = captured.response_format as {
      type: string;
      json_schema: { name: string; strict: boolean; schema: Record<string, unknown> };
    };
    expect(format.type).toBe("json_schema");
    expect(format.json_schema.name).toBe("claims");
    expect(format.json_schema.strict).toBe(true);
    expect(format.json_schema.schema.additionalProperties).toBe(false);
    expect(captured.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "usr" },
    ]);
  });

  it("retries once on 429 and then succeeds", async () => {
    let calls = 0;
    server.use(
      http.post("https://api.groq.com/openai/v1/chat/completions", () => {
        calls += 1;
        if (calls === 1) return new HttpResponse(null, { status: 429 });
        return HttpResponse.json({
          choices: [{ message: { content: '{"answer":"after retry"}' } }],
        });
      }),
    );
    const result = await llm().json({ system: "s", user: "u", schemaName: "claims", schema });
    expect(result.data.answer).toBe("after retry");
    expect(calls).toBe(2);
  });

  it("drops reasoning_effort when the provider rejects it with 400", async () => {
    const bodies: Record<string, unknown>[] = [];
    server.use(
      http.post("https://api.groq.com/openai/v1/chat/completions", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        bodies.push(body);
        if ("reasoning_effort" in body) return new HttpResponse(null, { status: 400 });
        return HttpResponse.json({
          choices: [{ message: { content: '{"answer":"no reasoning"}' } }],
        });
      }),
    );
    const result = await llm({ reasoningEffort: "low" }).json({
      system: "s",
      user: "u",
      schemaName: "claims",
      schema,
    });
    expect(result.data.answer).toBe("no reasoning");
    expect(bodies).toHaveLength(2);
    expect(bodies[0]?.reasoning_effort).toBe("low");
    expect(bodies[1]?.reasoning_effort).toBeUndefined();
  });

  it("falls back to the secondary provider after two 500s", async () => {
    let primaryCalls = 0;
    server.use(
      http.post("https://api.groq.com/openai/v1/chat/completions", () => {
        primaryCalls += 1;
        return new HttpResponse(null, { status: 500 });
      }),
      http.post("https://openrouter.ai/api/v1/chat/completions", () =>
        HttpResponse.json({ choices: [{ message: { content: '{"answer":"fallback"}' } }] }),
      ),
    );
    const result = await llm({ fallback }).json({
      system: "s",
      user: "u",
      schemaName: "claims",
      schema,
    });
    expect(result.data.answer).toBe("fallback");
    expect(result.provider).toBe("openrouter");
    expect(primaryCalls).toBe(2);
  });

  it("rejects invalid JSON content", async () => {
    server.use(
      http.post("https://api.groq.com/openai/v1/chat/completions", () =>
        HttpResponse.json({ choices: [{ message: { content: "not json" } }] }),
      ),
    );
    await expect(
      llm().json({ system: "s", user: "u", schemaName: "claims", schema }),
    ).rejects.toBeInstanceOf(LlmRequestError);
  });

  it("rejects JSON that fails the schema", async () => {
    server.use(
      http.post("https://api.groq.com/openai/v1/chat/completions", () =>
        HttpResponse.json({ choices: [{ message: { content: '{"wrong":true}' } }] }),
      ),
    );
    await expect(
      llm().json({ system: "s", user: "u", schemaName: "claims", schema }),
    ).rejects.toBeInstanceOf(z.ZodError);
  });

  it("fails without a configured provider", async () => {
    await expect(
      new OpenAiCompatLlm({ primary: { ...primary, apiKey: "" } }).json({
        system: "s",
        user: "u",
        schemaName: "claims",
        schema,
      }),
    ).rejects.toBeInstanceOf(LlmRequestError);
  });
});
