import { extractClaims } from "../extract/regexExtractor.js";
import type { GitPort } from "../ports.js";
import { tokens } from "../loop/text.js";
import { factKey, type Ledger, type LedgerEntry } from "./ledger.js";

export interface Facts {
  trusted: LedgerEntry[];
  warnings: LedgerEntry[];
  stale: LedgerEntry[];
}

/** A fact is stale if its anchor is not an ancestor of HEAD, or a tracked file differs from the working tree. */
export async function isStale(entry: LedgerEntry, git: GitPort, repoRoot: string): Promise<boolean> {
  const anc = await git.raw(["merge-base", "--is-ancestor", entry.anchorSha, "HEAD"], { cwd: repoRoot });
  if (anc.exitCode !== 0) return true;
  for (const [path, recorded] of Object.entries(entry.blobs)) {
    const now = await git.raw(["hash-object", "--", path], { cwd: repoRoot });
    const current = now.exitCode === 0 ? now.stdout.trim() : null;
    if (current !== recorded) return true;
  }
  return false;
}

const haystack = (e: LedgerEntry) => tokens([e.quote, e.subject ?? "", ...e.paths, ...e.symbols].join(" "));

function relevant(e: LedgerEntry, query: string | undefined): boolean {
  if (!query || query.trim() === "") return true;
  const wanted = tokens(query);
  const have = haystack(e);
  const lowerHave = [e.quote, e.subject ?? "", ...e.symbols, ...e.paths].join(" ").toLowerCase();
  for (const t of wanted) if (have.has(t) || lowerHave.includes(t)) return true;
  return false;
}

export async function facts(ledger: Ledger, git: GitPort, repoRoot: string, query?: string): Promise<Facts> {
  const out: Facts = { trusted: [], warnings: [], stale: [] };
  for (const e of await ledger.latestFacts()) {
    if (!relevant(e, query)) continue;
    if (await isStale(e, git, repoRoot)) out.stale.push(e);
    else if (e.status === "verified") out.trusted.push(e);
    else if (e.status === "contradicted") out.warnings.push(e);
  }
  return out;
}

const who = (e: LedgerEntry) => [e.actor.role, e.actor.agent, e.actor.model].filter(Boolean).join("/");

export interface Answer {
  claim: string;
  answer: string;
  status: "verified" | "contradicted" | "unverified";
}

/** Extracts claims from a teammate's statement and answers each from the ledger. */
export async function check(ledger: Ledger, git: GitPort, repoRoot: string, statement: string): Promise<Answer[]> {
  const all = await ledger.latestFacts();
  const claims = extractClaims(statement, []);
  const answers: Answer[] = [];
  for (const raw of claims) {
    const key = factKey({ type: raw.type, symbols: raw.symbols, paths: raw.paths, subject: raw.subject });
    const wanted = new Set([...raw.symbols, ...raw.paths].map((s) => s.toLowerCase()));
    const hit =
      all.find((e) => factKey(e) === key) ??
      all.find((e) => e.type === raw.type && [...e.symbols, ...e.paths].some((s) => wanted.has(s.toLowerCase())));
    if (!hit) {
      answers.push({ claim: raw.quote, answer: "unverified — check it yourself", status: "unverified" });
    } else if (await isStale(hit, git, repoRoot)) {
      answers.push({ claim: raw.quote, answer: `unverified — the evidence from ${who(hit)} is stale (the code changed since)`, status: "unverified" });
    } else if (hit.status === "verified") {
      answers.push({ claim: raw.quote, answer: `verified by ${who(hit)} at ${hit.headSha.slice(0, 7)}`, status: "verified" });
    } else if (hit.status === "contradicted") {
      answers.push({ claim: raw.quote, answer: `CONTRADICTED by evidence (${who(hit)}): ${hit.reason}`, status: "contradicted" });
    } else {
      answers.push({ claim: raw.quote, answer: "unverified — check it yourself", status: "unverified" });
    }
  }
  if (answers.length === 0) answers.push({ claim: statement, answer: "no checkable claim found — check it yourself", status: "unverified" });
  return answers;
}

export function renderFacts(f: Facts, heading = "What you can rely on"): string {
  const line = (e: LedgerEntry) => `- ${e.quote}  (${who(e)} @ ${e.headSha.slice(0, 7)})`;
  const out = [`## ${heading}`];
  out.push("", "### Trusted (verified, still current)", ...(f.trusted.length ? f.trusted.map(line) : ["- none"]));
  out.push("", "### Do NOT rely on (contradicted by evidence)", ...(f.warnings.length ? f.warnings.map((e) => `${line(e)}\n  CONTRADICTED: ${e.reason}`) : ["- none"]));
  out.push("", "### Stale (the code changed since; re-check)", ...(f.stale.length ? f.stale.map(line) : ["- none"]));
  return out.join("\n");
}
