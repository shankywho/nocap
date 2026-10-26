import { describe, expect, it, vi } from "vitest";
import { mapScope } from "../src/extract/scopeMapper";
import { keywordScope } from "../src/extract/keywordScope";
import type { LlmPort } from "../src/ports";

const files = [
  "src/auth/session.ts",
  "src/auth/login.ts",
  "src/retry.ts",
  "src/parser.ts",
  "test/retry.test.ts",
  "test/parser.test.ts",
  "package.json",
  "README.md",
];

function stubLlm(globs: string[]): LlmPort & { json: ReturnType<typeof vi.fn> } {
  return {
    json: vi.fn(async (args: { schema: { parse: (value: unknown) => unknown } }) => ({
      data: args.schema.parse({ concept: "dynamic", globs, rationale: "test" }),
      provider: "stub",
      model: "stub",
    })),
  } as unknown as LlmPort & { json: ReturnType<typeof vi.fn> };
}

describe("keywordScope", () => {
  it("finds the auth directory and returns a directory glob", () => {
    const mapping = keywordScope("auth", files);
    expect(mapping.globs).toEqual(["src/auth/**"]);
    expect(mapping.matchedFiles).toEqual(["src/auth/login.ts", "src/auth/session.ts"]);
  });

  it("returns individual files when only the file name matches", () => {
    const mapping = keywordScope("retry", files);
    expect(mapping.globs).toEqual(["src/retry.ts", "test/retry.test.ts"]);
  });

  it("returns an empty mapping when the concept is absent", () => {
    expect(keywordScope("kubernetes", files).globs).toEqual([]);
  });
});

describe("mapScope", () => {
  it("never calls the LLM for hardcoded concepts", async () => {
    const llm = stubLlm(["src/retry.ts"]);
    const mapping = await mapScope({ concept: "tests", files, llm });
    expect(llm.json).not.toHaveBeenCalled();
    expect(mapping.source).toBe("keyword");
    expect(mapping.matchedFiles).toContain("test/retry.test.ts");
  });

  it("lets a user override beat the model", async () => {
    const llm = stubLlm(["src/retry.ts"]);
    const mapping = await mapScope({
      concept: "auth",
      files,
      llm,
      overrides: { auth: ["src/auth/session.ts"] },
    });
    expect(llm.json).not.toHaveBeenCalled();
    expect(mapping.source).toBe("user");
    expect(mapping.globs).toEqual(["src/auth/session.ts"]);
  });

  it("drops model globs that match no file", async () => {
    const llm = stubLlm(["src/does-not-exist/**", "src/parser.ts"]);
    const mapping = await mapScope({ concept: "parser", files, llm });
    expect(mapping.source).toBe("llm");
    expect(mapping.globs).toEqual(["src/parser.ts"]);
  });

  it("falls back to the keyword mapper when the model returns only zero-match globs", async () => {
    const llm = stubLlm(["nope/**"]);
    const mapping = await mapScope({ concept: "auth", files, llm });
    expect(mapping.source).toBe("keyword");
    expect(mapping.globs).toEqual(["src/auth/**"]);
  });

  it("returns an empty mapping, never a guess, when nothing matches", async () => {
    const mapping = await mapScope({ concept: "kubernetes", files });
    expect(mapping.globs).toEqual([]);
    expect(mapping.source).toBe("keyword");
  });
});
