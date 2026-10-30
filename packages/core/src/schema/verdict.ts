import { z } from "zod";
import { Evidence } from "./evidence.js";

export const Flag = z.object({
  rule: z.string(),
  severity: z.enum(["info", "warn"]),
  path: z.string(),
  line: z.number().nullable(),
  detail: z.string(),
});

export const BitecheckResult = z.object({
  outcome: z.enum([
    "bites",
    "toothless",
    "import_only",
    "broken_on_head",
    "environment",
    "no_matching_tests",
  ]),
  /** `revert`: source files went back to base. `stub`: added functions were stubbed to `return undefined`. */
  mode: z.enum(["revert", "stub"]).default("revert"),
  /** In stub mode, the functions that were stubbed, as `path › name`. */
  stubbed: z.array(z.string()).default([]),
  selectedTests: z.array(z.object({ file: z.string(), title: z.string() })),
  revertedFiles: z.array(z.string()),
  deletedForRevert: z.array(z.string()),
  head: Evidence.nullable(),
  reverted: Evidence.nullable(),
});

export const Verdict = z.object({
  status: z.enum(["verified", "contradicted", "unverifiable"]),
  reason: z.string(),
  evidence: z.array(Evidence),
  flags: z.array(Flag),
  bitecheck: BitecheckResult.nullable(),
  repair: z.string().nullable(),
});

export type Flag = z.infer<typeof Flag>;
export type BitecheckResult = z.infer<typeof BitecheckResult>;
export type Verdict = z.infer<typeof Verdict>;
