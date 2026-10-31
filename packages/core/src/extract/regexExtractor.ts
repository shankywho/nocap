import type { ClaimType } from "../schema/claim.js";
import { contentWords, keywordsFor } from "./synonyms.js";

export interface RawClaim {
  quote: string;
  type: ClaimType;
  subject: string | null;
  keywords: string[];
  paths: string[];
  symbols: string[];
  count: number | null;
  command: string | null;
}

const BUILD_COMMANDS: Record<string, string> = {
  build: "npm run build",
  tsc: "npx tsc --noEmit",
  typecheck: "npx tsc --noEmit",
  "type-check": "npx tsc --noEmit",
  lint: "npm run lint",
  eslint: "npm run lint",
};

const PATH_TOKEN = /(?:^|[\s`"'(])([A-Za-z0-9_./-]*\.[A-Za-z0-9_.-]+|[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+|Makefile|Dockerfile|README|LICENSE)/gi;
const BACKTICK_SYMBOL = /`([A-Za-z_$][\w$]*)(\(\))?`/g;
const BARE_SYMBOL_AFTER_IN = /\bin\s+`?([A-Za-z_$][\w$]*)\b(?![/])/g;

const KNOWN_EXT =
  /\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb|json|yaml|yml|toml|md|txt|css|html|sh|bash|zsh)$/i;
const KNOWN_NAMES =
  /(?:^|\/)(?:\.(?:gitignore|npmignore|dockerignore|editorconfig|prettierrc.*|eslintrc.*|npmrc|nvmrc|env.*)|Makefile|Dockerfile|README|LICENSE)$/i;

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

export function extractPaths(sentence: string, knownPaths: string[] = []): string[] {
  const paths: string[] = [];
  const known = new Set(knownPaths.map((p) => normalisePath(p)));
  for (const match of sentence.matchAll(PATH_TOKEN)) {
    let candidate = match[1];
    if (!candidate) continue;
    candidate = candidate.replace(/[.,;:!?)]+$/, "");
    if (!candidate) continue;
    const norm = normalisePath(candidate);
    if (known.has(norm) || KNOWN_EXT.test(candidate) || KNOWN_NAMES.test(candidate)) {
      paths.push(candidate);
    }
  }
  return unique(paths);
}

export function extractSymbols(sentence: string): string[] {
  const symbols: string[] = [];
  for (const match of sentence.matchAll(BACKTICK_SYMBOL)) {
    if (match[1]) symbols.push(match[1]);
  }
  for (const match of sentence.matchAll(BARE_SYMBOL_AFTER_IN)) {
    if (match[1] && !symbols.includes(match[1])) symbols.push(match[1]);
  }
  return unique(symbols);
}

/** Normalise a path to repo-relative POSIX form. */
export function normalisePath(path: string, repoName?: string): string {
  let value = path.trim().replace(/^`|`$/g, "");
  value = value.replace(/^\.\//, "");
  value = value.replace(/^[ab]\//, "");
  if (repoName && value.startsWith(`${repoName}/`)) value = value.slice(repoName.length + 1);
  return value.replace(/^\/+/, "");
}

function camelSplit(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/\s+/)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length > 2);
}

export function keywordsForSubject(subject: string | null): string[] {
  if (!subject) return [];
  const expanded = subject
    .split(/\s+/)
    .map((word) => (/([a-z0-9])([A-Z])/.test(word) ? camelSplit(word).join(" ") : word))
    .join(" ");
  return keywordsFor(expanded, 8);
}

/** Removes path tokens and trailing "in <path>" from a captured subject. */
function cleanSubject(subject: string, paths: string[]): string | null {
  let value = subject.trim().replace(/[.!?]+$/, "");
  for (const path of paths) {
    value = value.replace(
      new RegExp(`\\s*(?:in|to|at|from)\\s+${escapeRegExp(path)}\\s*$`, "i"),
      "",
    );
    value = value.replace(path, "");
  }
  value = value
    .replace(/[`"'.,;:!?()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  value = value.replace(/^(?:the|a|an)\s+/i, "");
  value = value.replace(/\s+(?:in|to|at|from|of|on|with)$/i, "").trim();
  if (!value) return null;
  return value;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface RuleMatch {
  type: ClaimType;
  subject?: string | null;
  count?: number | null;
  command?: string | null;
  path?: string | null;
  paths?: string[] | null;
  quote?: string | null;
}

interface Rule {
  type: ClaimType;
  pattern: RegExp;
  build: (match: RegExpMatchArray, sentence: string) => RuleMatch | null;
}

const RULES: Rule[] = [
  {
    type: "refactor_no_behavior_change",
    pattern: /\b(?:pure\s+)?refactor(?:ed)?\b.*\bno\s+(?:behaviou?r|functional)\s+change/i,
    build: (match) => {
      const paths = extractPaths(match[0]);
      return {
        type: "refactor_no_behavior_change",
        subject: paths[0] ?? null,
        path: paths[0] ?? null,
      };
    },
  },
  {
    type: "scope_none",
    pattern:
      /\b(?:didn'?t|did not|do not|don'?t|never)\s+(?:touch|modify|change|update|edit|alter)?\s*(.+)$/i,
    build: (match) => ({ type: "scope_none", subject: match[1] ?? null }),
  },
  {
    type: "scope_none",
    pattern: /\bno\s+changes?\s+(?:to|in)\s+(.+)$/i,
    build: (match) => ({ type: "scope_none", subject: match[1] ?? null }),
  },
  {
    type: "scope_none",
    pattern: /\bno\s+(?!.*(?:behaviou?r|functional))\s*(.+?)\s+changes?\b[.!?]?$/i,
    build: (match) => ({ type: "scope_none", subject: match[1] ?? null }),
  },
  {
    type: "scope_only",
    pattern: /\bonly\s+(?:changed|touched|modified|updated|edited)\s+(.+)$/i,
    build: (match) => ({ type: "scope_only", subject: match[1] ?? null }),
  },
  {
    type: "tests_pass",
    pattern:
      /\b(?:all\s+)?(?:(\d+)\s*(?:\/\s*(\d+))?\s*)?tests?\s+(?:now\s+)?(?:pass(?:ed|ing)?|are\s+(?:all\s+)?(?:green|passing))\b/i,
    build: (match) => ({
      type: "tests_pass",
      count: match[1] ? Number.parseInt(match[1], 10) : null,
      subject: null,
    }),
  },
  {
    type: "tests_pass",
    pattern: /\btests?\s+(?:are\s+)?(?:all\s+)?(?:green|passing)\b/i,
    build: () => ({ type: "tests_pass", count: null, subject: null }),
  },
  {
    type: "tests_added",
    pattern:
      /\b(?:added|wrote|created)\s+(?:\d+\s+)?(?:a\s+|an\s+|the\s+)?(?:(?:failing|new|unit|integration|e2e|regression|smoke)\s+)*tests?\s+(?:for|covering|to\s+cover)\s+(.+)$/i,
    build: (match) => ({ type: "tests_added", subject: match[1] ?? null }),
  },
  {
    type: "build_pass",
    pattern:
      /\b(build|tsc|typecheck|type-check|lint|eslint)\s+(?:passes|is\s+clean|succeeds|clean)\b/i,
    build: (match) => ({
      type: "build_pass",
      command: BUILD_COMMANDS[(match[1] ?? "").toLowerCase()] ?? null,
      subject: match[1] ?? null,
    }),
  },
  {
    type: "version_bumped",
    pattern:
      /\b(?:bump(?:ed|ing)?|increment(?:ed)?|raised?|updated?|set)\s+(?:the\s+)?(?:package\s+|project\s+)?version(?:\s+(?:number\s+)?(?:to|→|->)\s+v?(\d+\.\d+\.\d+[\w.+-]*))?|\bversion\s+bump(?:ed)?(?:\s+(?:to|→|->)\s+v?(\d+\.\d+\.\d+[\w.+-]*))?|\bbump(?:ed)?\s+(?:\S+\s+)?to\s+v?(\d+\.\d+\.\d+[\w.+-]*)/i,
    build: (match) => ({ type: "version_bumped", subject: (match[1] ?? match[2] ?? match[3])?.replace(/[.+-]+$/, "") ?? null }),
  },
  {
    type: "snapshots_updated",
    pattern: /\b(?:regenerated|regenerate|updated|refreshed|re-?recorded|rebuilt|re-?generated)\s+(?:the\s+)?(?:\w+\s+)?(golden(?:s| files?)?|snapshots?)\b/i,
    build: (match) => ({ type: "snapshots_updated", subject: match[1]?.toLowerCase() ?? null }),
  },
  {
    type: "bug_fixed",
    pattern: /\b(?:fixed|resolved)\s+(?:the\s+)?(.+?)[.!?]?$/i,
    build: (match) => ({ type: "bug_fixed", subject: match[1] ?? null }),
  },
  {
    type: "file_created",
    pattern:
      /\b(?:created|added)\s+(?:a\s+|the\s+)?(?:new\s+)?(?:file\s+)?`?([A-Za-z0-9_./-]*\.[A-Za-z0-9_.-]+|[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+|Makefile|Dockerfile|README|LICENSE)`?/i,
    build: (match) => {
      const p = match[1]?.replace(/[.,;:!?)]+$/, "") ?? null;
      return { type: "file_created", path: p, subject: p };
    },
  },
  {
    type: "file_created",
    pattern:
      /\b(?:created|added)\s+(?:[A-Za-z0-9_ -]+\s+)?(?:files?|configs?|configuration|setup)\s*(?:\([^)]+\)|:\s*.+)/i,
    build: (match) => {
      const paths = extractPaths(match[0]);
      return paths.length > 0 ? { type: "file_created", paths, subject: null, quote: match[0] } : null;
    },
  },
  {
    type: "file_modified",
    pattern:
      /\b(?:updated|modified|changed|edited|refactored)\s+(?:the\s+)?(?:file\s+)?`?([A-Za-z0-9_./-]*\.[A-Za-z0-9_.-]+|[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+|Makefile|Dockerfile|README|LICENSE)`?/i,
    build: (match) => {
      const p = match[1]?.replace(/[.,;:!?)]+$/, "") ?? null;
      return {
        type: "file_modified",
        path: p,
        subject: p,
      };
    },
  },
  {
    type: "file_modified",
    pattern:
      /\b(?:updated|modified|changed|edited|refactored)\s+(?:[A-Za-z0-9_ -]+\s+)?(?:files?|configs?|configuration|setup)\s*(?:\([^)]+\)|:\s*.+)/i,
    build: (match) => {
      const paths = extractPaths(match[0]);
      return paths.length > 0 ? { type: "file_modified", paths, subject: null, quote: match[0] } : null;
    },
  },
  {
    type: "file_deleted",
    pattern:
      /\b(?:deleted|removed)\s+(?:the\s+)?(?:file\s+)?`?([A-Za-z0-9_./-]*\.[A-Za-z0-9_.-]+|[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+|Makefile|Dockerfile|README|LICENSE)`?/i,
    build: (match) => {
      const p = match[1]?.replace(/[.,;:!?)]+$/, "") ?? null;
      return { type: "file_deleted", path: p, subject: p };
    },
  },
  {
    type: "symbol_added",
    pattern:
      /\b(?:added|introduced|implemented|wrote|exported)\s+(?:a\s+|the\s+|new\s+)?(?:function|helper|method|class|hook)?\s*`([A-Za-z_$][\w$]*)\(?\)?`/i,
    build: (match) => ({ type: "symbol_added", subject: match[1] ?? null }),
  },
  {
    type: "dependency_added",
    pattern:
      /\b(?:added|installed)\s+(?:the\s+)?(?:dependency|package|library)\s+`?(@?[A-Za-z0-9_./-]+)`?/i,
    build: (match) => ({ type: "dependency_added", subject: match[1] ?? null }),
  },
  {
    type: "count_files_changed",
    pattern: /\b(?:changed|modified|touched|updated)\s+(\d+)\s+files\b/i,
    build: (match) => ({
      type: "count_files_changed",
      count: Number.parseInt(match[1] ?? "0", 10),
    }),
  },
  {
    type: "file_modified",
    pattern:
      /\b(?:added|introduced|created)\s+(.+?)\s+to\s+`?([A-Za-z_$][\w$]*)`?\s*(?:in\s+)?`?([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\.[A-Za-z0-9]+)?/i,
    build: (match) => ({
      type: "file_modified",
      subject: match[1] ?? null,
      path: match[3] ?? null,
    }),
  },
];

function splitSentences(summary: string): string[] {
  const lines = summary.split(/\r?\n/);
  const sentences: string[] = [];
  for (const rawLine of lines) {
    const line = rawLine.replace(/^\s*[-*•]\s*/, "").trim();
    if (!line) continue;
    const parts = line.split(/(?<=[.!?])\s+(?=[A-Z`"'(])/);
    for (const part of parts) {
      const value = part.trim();
      if (value) sentences.push(value);
    }
  }
  return sentences;
}

const CLAUSE_ACTION_START =
  /^(?:updated|modified|changed|edited|refactored|created|added|deleted|removed|fixed|resolved|wrote|implemented|bumped|regenerated|didn'?t|did\s+not|never|no\s+|tests?\s+|all\s+|only\s+|tsc\b|lint\b|build\b)/i;

function splitClauses(sentence: string): string[] {
  const clauses: string[] = [];
  let current = "";
  let depth = 0;
  let i = 0;
  while (i < sentence.length) {
    const ch = sentence[i];
    if (ch === "(" || ch === "[" || ch === "{") {
      depth++;
      current += ch;
      i++;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      if (depth > 0) depth--;
      current += ch;
      i++;
    } else if (depth === 0) {
      const rest = sentence.slice(i);
      const commaAnd = rest.match(/^(?:(?<!\d),(?!\d)\s*(?:and\s+|then\s+)?)/i);
      const thenMatch = rest.match(/^\s+then\s+/i);
      const semiMatch = rest.match(/^;\s*/i);
      const andMatch = rest.match(/^\s+and\s+/i);

      if (commaAnd) {
        if (current.trim().length > 0) clauses.push(current.trim());
        current = "";
        i += commaAnd[0]!.length;
      } else if (thenMatch) {
        if (current.trim().length > 0) clauses.push(current.trim());
        current = "";
        i += thenMatch[0]!.length;
      } else if (semiMatch) {
        if (current.trim().length > 0) clauses.push(current.trim());
        current = "";
        i += semiMatch[0]!.length;
      } else if (andMatch && CLAUSE_ACTION_START.test(rest.slice(andMatch[0]!.length))) {
        if (current.trim().length > 0) clauses.push(current.trim());
        current = "";
        i += andMatch[0]!.length;
      } else {
        current += ch;
        i++;
      }
    } else {
      current += ch;
      i++;
    }
  }
  if (current.trim().length > 0) clauses.push(current.trim());
  return clauses;
}

function matchRule(sentence: string): { match: RuleMatch; rule: Rule } | null {
  for (const rule of RULES) {
    const match = rule.pattern.exec(sentence);
    if (!match) continue;
    const built = rule.build(match, sentence);
    if (!built) continue;
    return { match: built, rule };
  }
  return null;
}

function toRawClaim(quote: string, match: RuleMatch, fallbackPaths: string[]): RawClaim | null {
  const actualQuote = match.quote ?? quote;
  const rawPaths = match.paths ?? (match.path ? [match.path, ...fallbackPaths] : fallbackPaths);
  const paths = rawPaths.map((path) => normalisePath(path));
  const symbols = extractSymbols(actualQuote);
  let subject = match.subject ?? null;

  if (match.path && !match.paths) {
    paths.unshift(normalisePath(match.path));
  }
  if (match.type === "bug_fixed" || match.type === "symbol_added") {
    const symbol = symbols[0];
    if (symbol && (!subject || /^[A-Za-z_$][\w$]*$/.test(subject))) subject = subject ?? symbol;
  }
  if (
    match.type === "file_created" ||
    match.type === "file_modified" ||
    match.type === "file_deleted"
  ) {
    subject = subject && /^[A-Za-z0-9_./-]+$/.test(subject) ? null : subject;
  }

  const cleaned = match.subject ? cleanSubject(match.subject, paths) : null;
  if (
    match.type !== "file_created" &&
    match.type !== "file_modified" &&
    match.type !== "file_deleted"
  ) {
    subject = cleaned;
  }

  // A version number must survive: cleanSubject strips the dots.
  if (match.type === "version_bumped") subject = match.subject ?? null;

  const symbolKeywords = symbols.flatMap((symbol) => keywordPartsForSymbol(symbol));

  return {
    quote: actualQuote,
    type: match.type,
    subject,
    keywords: [...new Set([...keywordsForSubject(subject), ...symbolKeywords])].slice(0, 8),
    paths: unique(paths),
    symbols,
    count: match.count ?? null,
    command: match.command ?? null,
  };
}

function keywordPartsForSymbol(symbol: string): string[] {
  return contentWords(symbol.replace(/([a-z0-9])([A-Z])/g, "$1 $2"));
}

const IGNORABLE = /^(?:done|ok|okay|all set|finished|ready|great|nice|thanks|thank you)\.?$/i;

/**
 * Deterministic claim extraction. This is the offline path, the mock LLM's
 * behaviour and the fallback when a model reply fails validation.
 */
export function extractClaims(summary: string, _changedPaths: string[] = []): RawClaim[] {
  const claims: RawClaim[] = [];
  const seen = new Set<string>();

  for (const sentence of splitSentences(summary)) {
    if (IGNORABLE.test(sentence.trim())) continue;
    const sentencePaths = extractPaths(sentence, _changedPaths);

    const primary = matchRule(sentence);
    if (primary) {
      const claim = toRawClaim(sentence, primary.match, sentencePaths);
      if (claim) {
        const key = `${claim.type}:${claim.quote.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          claims.push(claim);
        }
      }
    }

    // Secondary clause scan: one sentence can carry two checkable statements.
    for (const clause of splitClauses(sentence)) {
      if (clause === sentence) continue;
      const clauseMatch = matchRule(clause);
      if (!clauseMatch) continue;
      if (primary && clauseMatch.match.type === primary.match.type && !clauseMatch.match.paths) continue;
      const claim = toRawClaim(clause, clauseMatch.match, extractPaths(clause, _changedPaths));
      if (!claim) continue;
      const key = `${claim.type}:${claim.quote.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      claims.push(claim);
    }

    // "Added `x()` in/to src/x.ts" states a symbol and a file change: emit both.
    if (primary?.match.type === "symbol_added") {
      const target = /\b(?:in|to)\s+`?([A-Za-z0-9_./-]*\.[A-Za-z0-9_.-]+|[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+|Makefile|Dockerfile|README|LICENSE)`?/i
        .exec(sentence)?.[1]
        ?.replace(/[.,;:!?)]+$/, "");
      if (target && extractPaths(sentence, _changedPaths).includes(target)) {
        const key = `file_modified:${sentence.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          claims.push({
            quote: sentence,
            type: "file_modified",
            subject: null,
            keywords: [],
            paths: [normalisePath(target)],
            symbols: [],
            count: null,
            command: null,
          });
        }
      }
    }

    // "Created `src/backoff.ts` with `computeDelay()`" also states a symbol.
    if (primary?.match.type === "file_created") {
      for (const symbol of extractSymbols(sentence)) {
        if (primary.match.path && symbol === primary.match.path.split("/").pop()) continue;
        const quote = `\`${symbol}()\``;
        if (!summary.includes(quote)) continue;
        const key = `symbol_added:${symbol}`;
        if (seen.has(key)) continue;
        seen.add(key);
        claims.push({
          quote,
          type: "symbol_added",
          subject: symbol,
          keywords: keywordsForSubject(symbol),
          paths: [],
          symbols: [symbol],
          count: null,
          command: null,
        });
      }
    }
  }

  return claims;
}

export { contentWords };
