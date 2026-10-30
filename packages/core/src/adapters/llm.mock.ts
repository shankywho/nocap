import type { z } from "zod";
import type { LlmPort } from "../ports.js";
import { keywordScope } from "../extract/keywordScope.js";
import { extractClaims } from "../extract/regexExtractor.js";

function block(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  if (from === -1) return "";
  const begin = from + start.length;
  const to = text.indexOf(end, begin);
  return (to === -1 ? text.slice(begin) : text.slice(begin, to)).trim();
}

function listBlock(text: string, start: string, end: string): string[] {
  return block(text, start, end)
    .split("\n")
    .map((line) => line.replace(/^-\s*/, "").trim())
    .filter((line) => line.length > 0 && !line.startsWith("("));
}

/**
 * Deterministic mock: it runs the exact same extractor and mapper as offline
 * mode, so switching MOCK_EXTERNALS never changes a verdict.
 */
export class MockLlm implements LlmPort {
  async json<T>(args: {
    system: string;
    user: string;
    schemaName: string;
    schema: z.ZodType<T>;
    maxTokens?: number;
  }): Promise<{ data: T; provider: string; model: string }> {
    if (args.schemaName === "claims") {
      const summary = block(args.user, "SUMMARY:", "END SUMMARY");
      const paths = listBlock(args.user, "END SUMMARY", "END PATHS").filter(
        (line) => line.includes("/") || /\.[a-z]+$/.test(line),
      );
      const payload = { claims: extractClaims(summary, paths) };
      return {
        data: args.schema.parse(payload),
        provider: "offline",
        model: "offline",
      };
    }

    if (args.schemaName === "scope") {
      const firstLine = args.user.split("\n")[0] ?? "";
      const concept = firstLine.replace(/^CONCEPT:\s*/, "").trim();
      const files = listBlock(args.user, "FILES:", "END FILES");
      const mapping = keywordScope(concept, files);
      return {
        data: args.schema.parse({
          concept,
          globs: mapping.globs,
          rationale: "deterministic keyword mapping",
        }),
        provider: "offline",
        model: "offline",
      };
    }

    throw new Error(`MockLlm does not implement schema "${args.schemaName}"`);
  }
}
