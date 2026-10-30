import type { Claim } from "../schema/claim.js";
import type { Receipt } from "../schema/receipt.js";
import type { Flag } from "../schema/verdict.js";
import { normaliseQuote, overlap } from "./text.js";

type Item = Receipt["chain"]["items"][number];
type Outcome = Receipt["chain"]["outcome"];

export const itemKey = normaliseQuote;

const TEST_TYPES = new Set<Claim["type"]>(["tests_added", "bug_fixed", "tests_pass", "refactor_no_behavior_change"]);
const WEAKENING = new Set(["skip_added", "only_added", "assertions_removed", "assertion_loosened", "test_file_deleted", "test_count_dropped", "trivial_assertion"]);
const THRESHOLD = 0.8;

export interface AdvanceInput {
  parent: Receipt;
  attempt: number;
  claims: Receipt["claims"];
  /** Quotes the agent withdrew with `Retracted: ...` in this attempt's summary. */
  retractions: string[];
  /** Tamper flags computed on the delta from the previous attempt's head to this one. */
  deltaFlags: Flag[];
}

export interface Advance {
  items: Item[];
  outcome: Outcome;
  flags: Flag[];
  /** True when an open item was dropped silently or "repaired" by weakening tests. */
  gamed: boolean;
}

function findClaim(item: Item, parentClaims: Receipt["claims"], claims: Receipt["claims"]) {
  const original = parentClaims.find((c) => itemKey(c.claim.quote) === item.key)?.claim;
  return claims.find(
    (c) =>
      overlap(c.claim.quote, item.quote) >= THRESHOLD ||
      (original !== undefined &&
        c.claim.type === original.type &&
        c.claim.paths.length > 0 &&
        c.claim.paths.join("|") === original.paths.join("|")),
  );
}

export function advanceChain(input: AdvanceInput): Advance {
  const { parent, attempt, claims } = input;
  const weakening = input.deltaFlags.filter((f) => WEAKENING.has(f.rule));
  const flags: Flag[] = [];
  const items: Item[] = [];
  let gamed = false;

  for (const item of parent.chain.items) {
    if (item.status === "fixed" || item.status === "retracted") {
      items.push(item);
      continue;
    }
    const original = parent.claims.find((c) => itemKey(c.claim.quote) === item.key)?.claim;
    const isTest = original !== undefined && TEST_TYPES.has(original.type);
    const weakened = isTest && weakening.length > 0;
    const retracted = input.retractions.some((q) => overlap(q, item.quote) >= THRESHOLD);
    const match = findClaim(item, parent.claims, claims);
    const weakFlag = (): Flag => ({
      rule: "repair_by_weakening",
      severity: "warn",
      path: weakening[0]?.path ?? "",
      line: weakening[0]?.line ?? null,
      detail: `tests were weakened to resolve "${item.quote}": ${weakening.map((f) => f.rule).join(", ")}`,
    });

    if (retracted) {
      items.push({ ...item, status: "retracted", resolvedAttempt: attempt });
    } else if (match === undefined) {
      gamed = true;
      items.push({ ...item, status: "dropped_silently", resolvedAttempt: null });
      flags.push({
        rule: "dropped_silently",
        severity: "warn",
        path: "",
        line: null,
        detail: `claim disappeared without retraction: "${item.quote}"`,
      });
      if (weakened) flags.push(weakFlag());
    } else if (match.verdict.status === "verified" && weakened) {
      gamed = true;
      items.push({ ...item, status: "repair_by_weakening", resolvedAttempt: null });
      flags.push(weakFlag());
    } else if (match.verdict.status === "verified") {
      items.push({ ...item, status: "fixed", resolvedAttempt: attempt });
    } else {
      items.push({ ...item, status: "open", resolvedAttempt: null });
    }
  }

  // Contradicted claims that are not tracked yet become new open items.
  for (const { claim, verdict } of claims) {
    if (verdict.status !== "contradicted") continue;
    const key = itemKey(claim.quote);
    if (items.some((i) => i.key === key || overlap(i.quote, claim.quote) >= THRESHOLD)) continue;
    items.push({ key, quote: claim.quote, status: "open", sinceAttempt: attempt, resolvedAttempt: null });
  }

  const open = items.filter((i) => i.status !== "fixed" && i.status !== "retracted");
  const resolved = items.length - open.length;
  const outcome: Outcome = open.length === 0 ? "resolved" : resolved > 0 ? "partial" : "unresolved";
  return { items, outcome, flags, gamed };
}
