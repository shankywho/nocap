const STOP = new Set(["a", "an", "the", "of", "to", "in", "on", "for", "and", "is", "are", "was", "were"]);

export function normaliseQuote(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_"'“”]/g, "")
    .replace(/[.!?:;,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(text: string): Set<string> {
  return new Set(
    normaliseQuote(text)
      .split(/[^a-z0-9./_-]+/)
      .filter((t) => t.length > 0 && !STOP.has(t)),
  );
}

/** Share of the smaller token set found in the larger one (1 = identical, 0 = disjoint). */
export function overlap(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.max(ta.size, tb.size);
}

export interface Retractions {
  quotes: string[];
  /** The summary with each retraction blanked to spaces, so claim spans keep their offsets. */
  stripped: string;
}

const RETRACTION = /Retracted:[ \t]*([^\n]*?)(?:[.!?](?=\s|$)|$)/gim;

/** `Retracted: <original quote>` marks a claim the agent withdraws; it must not be re-extracted as a claim. */
export function parseRetractions(summary: string): Retractions {
  const quotes: string[] = [];
  const stripped = summary.replace(RETRACTION, (match, quote: string) => {
    if (quote.trim().length > 0) quotes.push(quote.trim());
    return " ".repeat(match.length);
  });
  return { quotes, stripped };
}
