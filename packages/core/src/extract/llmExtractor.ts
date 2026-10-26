import { ZodError, z } from "zod";
import { ClaimType } from "../schema/claim.js";
import type { Claim } from "../schema/claim.js";
import type { LlmPort } from "../ports.js";
import { buildExtractUser, EXTRACT_SCHEMA_NAME, EXTRACT_SYSTEM } from "./prompts.js";
import { quoteGuard } from "./quoteGuard.js";
import { extractClaims, type RawClaim } from "./regexExtractor.js";

export const LlmClaim = z.object({
  quote: z.string().min(3),
  type: ClaimType,
  subject: z.string().nullable(),
  keywords: z.array(z.string()),
  paths: z.array(z.string()),
  symbols: z.array(z.string()),
  count: z.number().int().nullable(),
  command: z.string().nullable(),
});

export const LlmExtractOutput = z.object({ claims: z.array(LlmClaim).max(40) });

export interface ExtractionResult {
  claims: Claim[];
  degraded: boolean;
  dropped: number;
  provider: string;
  model: string;
}

function toRaw(claims: z.infer<typeof LlmClaim>[], repoName?: string): RawClaim[] {
  return claims.map((claim) => ({
    ...claim,
    paths: claim.paths.map((path) =>
      path
        .replace(/^\.\//, "")
        .replace(/^[ab]\//, "")
        .replace(repoName ? new RegExp(`^${repoName}/`) : /^$/, ""),
    ),
  }));
}

/**
 * Model-backed extraction with exactly one validation repair retry, then the
 * deterministic extractor. The model can only propose quotes, types and
 * mappings; quoteGuard and the verifiers decide what survives.
 */
export async function extractWithLlm(opts: {
  llm: LlmPort;
  summary: string;
  changedPaths: string[];
  repoName?: string;
}): Promise<ExtractionResult> {
  const summary = opts.summary.slice(0, 20_000);
  const user = buildExtractUser(summary, opts.changedPaths);

  try {
    const first = await opts.llm.json({
      system: EXTRACT_SYSTEM,
      user,
      schemaName: EXTRACT_SCHEMA_NAME,
      schema: LlmExtractOutput,
      maxTokens: 2000,
    });
    const guarded = quoteGuard(toRaw(first.data.claims, opts.repoName), summary);
    return {
      claims: guarded.claims,
      degraded: false,
      dropped: guarded.dropped,
      provider: first.provider,
      model: first.model,
    };
  } catch (error) {
    const reason =
      error instanceof ZodError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    try {
      const repair = await opts.llm.json({
        system: EXTRACT_SYSTEM,
        user: `${user}\n\nYour JSON failed validation: ${reason}\nReturn corrected JSON only.`,
        schemaName: EXTRACT_SCHEMA_NAME,
        schema: LlmExtractOutput,
        maxTokens: 2000,
      });
      const guarded = quoteGuard(toRaw(repair.data.claims, opts.repoName), summary);
      return {
        claims: guarded.claims,
        degraded: false,
        dropped: guarded.dropped,
        provider: repair.provider,
        model: repair.model,
      };
    } catch {
      const guarded = quoteGuard(extractClaims(summary, opts.changedPaths), summary);
      return {
        claims: guarded.claims,
        degraded: true,
        dropped: guarded.dropped,
        provider: "offline",
        model: "offline",
      };
    }
  }
}
