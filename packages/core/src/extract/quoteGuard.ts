import type { Claim } from "../schema/claim.js";
import type { RawClaim } from "./regexExtractor.js";

/** Whitespace- and backtick-insensitive form used for substring checks. */
export function normaliseQuote(value: string): string {
  return value.replace(/`/g, "").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function loosePattern(quote: string): RegExp {
  const tokens = normaliseQuote(quote).split(" ").map(escapeRegExp);
  return new RegExp(tokens.join("\\s+"));
}

export interface QuoteGuardResult {
  claims: Claim[];
  dropped: number;
}

/**
 * Drops claims whose quote is not a normalised substring of the summary and
 * assigns ids/spans in summary order. Code owns ids and spans, never the model.
 */
export function quoteGuard(raw: RawClaim[], summary: string): QuoteGuardResult {
  const kept: { claim: Claim; start: number }[] = [];
  let dropped = 0;

  // Match against the summary with backticks removed, then map the match back
  // to original offsets so spans still point at the real summary text.
  const searchable = summary.replace(/`/g, "");
  const originalIndex: number[] = [];
  for (let index = 0; index < summary.length; index += 1) {
    if (summary[index] !== "`") originalIndex.push(index);
  }

  for (const candidate of raw) {
    const pattern = loosePattern(candidate.quote);
    const match = pattern.exec(searchable);
    if (!match) {
      dropped += 1;
      continue;
    }
    const start = originalIndex[match.index] ?? match.index;
    const last = originalIndex[match.index + match[0].length - 1] ?? start + match[0].length - 1;
    kept.push({
      start,
      claim: {
        id: "",
        quote: candidate.quote,
        type: candidate.type,
        subject: candidate.subject,
        keywords: candidate.keywords,
        paths: candidate.paths,
        symbols: candidate.symbols,
        count: candidate.count,
        command: candidate.command,
        span: [start, last + 1],
      },
    });
  }

  kept.sort((a, b) => a.start - b.start);

  const seen = new Set<string>();
  const claims: Claim[] = [];
  for (const entry of kept) {
    const key = `${entry.claim.type}:${normaliseQuote(entry.claim.quote).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    claims.push({ ...entry.claim, id: `c${claims.length + 1}` });
    if (claims.length >= 25) break;
  }

  return { claims, dropped };
}
