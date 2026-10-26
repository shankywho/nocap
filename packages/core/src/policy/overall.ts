import type { Evidence } from "../schema/evidence.js";
import type { Flag, Verdict } from "../schema/verdict.js";
import { isConfigPath, isTestPath } from "../git/classify.js";

export type Overall = "PASS" | "FAIL" | "MIXED";

export function overallPolicy(
  verdicts: Pick<Verdict, "status" | "flags">[],
  globalFlags: Flag[],
  undisclosed: Evidence[],
): Overall {
  if (verdicts.some((v) => v.status === "contradicted")) return "FAIL";
  const risky = undisclosed.some((e) => e.kind === "file" && (isTestPath(e.path) || isConfigPath(e.path)));
  if (
    verdicts.some((v) => v.status === "unverifiable" || v.flags.length > 0) ||
    globalFlags.length > 0 ||
    risky
  ) {
    return "MIXED";
  }
  return "PASS";
}

export function totals(verdicts: Pick<Verdict, "status" | "flags">[], globalFlags: Flag[]) {
  return {
    verified: verdicts.filter((v) => v.status === "verified").length,
    contradicted: verdicts.filter((v) => v.status === "contradicted").length,
    unverifiable: verdicts.filter((v) => v.status === "unverifiable").length,
    flags: verdicts.reduce((n, v) => n + v.flags.length, 0) + globalFlags.length,
  };
}
