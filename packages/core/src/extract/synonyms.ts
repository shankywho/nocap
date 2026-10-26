/**
 * Small synonym table so a concept in the summary can be matched against
 * real paths in the repo ("retry" -> backoff, attempt, delay).
 */
export const SYNONYMS: Record<string, string[]> = {
  retry: ["backoff", "attempt", "delay"],
  backoff: ["delay", "exponential", "retry"],
  auth: ["login", "session", "token", "jwt", "oauth", "passport", "middleware"],
  session: ["auth", "login", "token"],
  parser: ["parse", "tokenize", "price"],
  parsing: ["parse", "parser", "price"],
  parseprice: ["parse", "price", "parser"],
  parse: ["parser", "price", "tokenize"],
  price: ["parser", "parse", "currency", "amount"],
  cache: ["memo", "ttl", "redis"],
  test: ["tests", "spec", "suite"],
  tests: ["test", "spec", "suite"],
  timeout: ["deadline", "ttl", "expiry"],
  error: ["exception", "failure", "fault"],
  log: ["logging", "logger", "audit"],
  delay: ["sleep", "backoff", "timeout"],
  config: ["configuration", "settings", "options"],
  api: ["endpoint", "route", "handler", "rest"],
  db: ["database", "sql", "prisma", "schema"],
};

export function synonymsFor(subject: string): string[] {
  const key = subject.toLowerCase().trim();
  return SYNONYMS[key] ?? [];
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "to",
  "in",
  "on",
  "for",
  "with",
  "and",
  "or",
  "of",
  "that",
  "this",
  "it",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "at",
  "by",
  "from",
  "as",
  "no",
  "not",
  "now",
  "new",
  "all",
  "any",
  "only",
  "still",
  "also",
  "then",
  "first",
  "so",
  "if",
  "but",
]);

/** Lowercase content words of a subject, de-duplicated, order preserved. */
export function contentWords(subject: string): string[] {
  const words = subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
  return [...new Set(words)];
}

export function keywordsFor(subject: string | null, limit = 8): string[] {
  if (!subject) return [];
  const base = contentWords(subject);
  const extra: string[] = [];
  for (const word of base.length > 0 ? base : contentWords(subject)) {
    for (const synonym of synonymsFor(word)) {
      if (!base.includes(synonym) && !extra.includes(synonym)) extra.push(synonym);
    }
  }
  return [...base, ...extra].slice(0, limit);
}
