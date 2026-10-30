import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { MockLlm } from "../src/adapters/llm.mock";
import { LlmRequestError } from "../src/adapters/llm.openaiCompat";
import { LlmExtractOutput, extractWithLlm } from "../src/extract/llmExtractor";
import { extractClaims } from "../src/extract/regexExtractor";
import { EXTRACT_SCHEMA_NAME, buildExtractUser } from "../src/extract/prompts";
import type { LlmPort } from "../src/ports";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const summary = readFileSync(`${root}/fixtures/scenarios/honest/summary.md`, "utf8");

function stubLlm(responses: (string | Error)[]): LlmPort & { json: ReturnType<typeof vi.fn> } {
  let index = 0;
  return {
    json: vi.fn(async (args: { schema: { parse: (value: unknown) => unknown } }) => {
      const next = responses[index++] ?? new Error("no response queued");
      if (next instanceof Error) throw next;
      return {
        data: args.schema.parse(JSON.parse(next)),
        provider: "stub",
        model: "stub-model",
      };
    }),
  } as unknown as LlmPort & { json: ReturnType<typeof vi.fn> };
}

const validBody = JSON.stringify({
  claims: [
    {
      quote: "Added exponential backoff to `withRetry` in src/retry.ts",
      type: "file_modified",
      subject: "exponential backoff",
      keywords: ["retry", "backoff"],
      paths: ["src/retry.ts"],
      symbols: ["withRetry"],
      count: null,
      command: null,
    },
  ],
});

describe("MockLlm", () => {
  it("matches the deterministic extractor exactly", async () => {
    const mock = new MockLlm();
    const changed = ["src/retry.ts", "test/retry.test.ts"];
    const result = await mock.json({
      system: "s",
      user: buildExtractUser(summary, changed),
      schemaName: EXTRACT_SCHEMA_NAME,
      schema: LlmExtractOutput,
    });
    expect(result.data.claims).toEqual(extractClaims(summary, changed));
    expect(result.provider).toBe("offline");
  });

  it("throws for an unknown schema", async () => {
    await expect(
      new MockLlm().json({
        system: "s",
        user: "u",
        schemaName: "nope",
        schema: LlmExtractOutput,
      }),
    ).rejects.toThrow(/does not implement/);
  });
});

describe("extractWithLlm", () => {
  it("returns guarded claims from a valid first response", async () => {
    const llm = stubLlm([validBody]);
    const result = await extractWithLlm({ llm, summary, changedPaths: [] });
    expect(result.degraded).toBe(false);
    expect(result.claims[0]?.type).toBe("file_modified");
    expect(result.claims[0]?.id).toBe("c1");
    expect(llm.json).toHaveBeenCalledTimes(1);
  });

  it("drops a paraphrased quote instead of trusting it", async () => {
    const paraphrase = JSON.stringify({
      claims: [{ ...JSON.parse(validBody).claims[0], quote: "Implemented a linear backoff" }],
    });
    const result = await extractWithLlm({ llm: stubLlm([paraphrase]), summary, changedPaths: [] });
    expect(result.claims).toEqual([]);
    expect(result.dropped).toBe(1);
  });

  it("makes one repair retry when the first reply is invalid", async () => {
    const llm = stubLlm([new LlmRequestError("provider returned invalid JSON"), validBody]);
    const result = await extractWithLlm({ llm, summary, changedPaths: [] });
    expect(llm.json).toHaveBeenCalledTimes(2);
    expect(result.degraded).toBe(false);
    const second = llm.json.mock.calls[1]?.[0] as { user: string };
    expect(second.user).toContain("Your JSON failed validation");
  });

  it("falls back to the regex extractor when both replies fail", async () => {
    const llm = stubLlm([new LlmRequestError("down"), new LlmRequestError("still down")]);
    const result = await extractWithLlm({ llm, summary, changedPaths: [] });
    expect(result.degraded).toBe(true);
    expect(result.provider).toBe("offline");
    expect(result.claims.map((claim) => claim.type)).toEqual([
      "file_modified",
      "tests_added",
      "scope_none",
      "tests_pass",
    ]);
  });
});
