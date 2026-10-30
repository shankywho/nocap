import { z } from "zod";
import { Claim } from "./claim.js";
import { Evidence } from "./evidence.js";
import { Flag, Verdict } from "./verdict.js";

export const ChainItemStatus = z.enum([
  "open",
  "fixed",
  "retracted",
  "dropped_silently",
  "repair_by_weakening",
]);

export const TraceStep = z.object({
  step: z.string(),
  ms: z.number(),
  status: z.enum(["ok", "skipped", "error"]),
  detail: z.string().max(300),
});

export const Receipt = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  runId: z.string(),
  createdAt: z.string(),
  input: z.object({
    mode: z.enum(["local", "pr"]),
    agent: z.string(),
    summary: z.string().max(20000),
    repo: z.string().nullable(),
    pr: z.number().nullable(),
    base: z.string(),
    head: z.string(),
    headIsSnapshot: z.boolean(),
    alan: z
      .object({ taskId: z.string().nullable(), sessionId: z.string().nullable() })
      .nullable(),
  }),
  chain: z.object({
    chainId: z.string(),
    parentId: z.string().nullable(),
    attempt: z.number().int().min(1),
    items: z.array(
      z.object({
        key: z.string(),
        quote: z.string(),
        status: ChainItemStatus,
        sinceAttempt: z.number().int(),
        resolvedAttempt: z.number().int().nullable(),
      }),
    ),
    outcome: z.enum(["first_attempt", "resolved", "partial", "unresolved"]),
  }),
  actor: z.object({ agent: z.string(), model: z.string().nullable(), role: z.string().nullable() }),
  claims: z.array(z.object({ claim: Claim, verdict: Verdict })),
  undisclosed: z.array(Evidence),
  globalFlags: z.array(Flag),
  totals: z.object({
    verified: z.number(),
    contradicted: z.number(),
    unverifiable: z.number(),
    flags: z.number(),
  }),
  overall: z.enum(["PASS", "FAIL", "MIXED"]),
  model: z.object({ provider: z.string(), id: z.string(), degraded: z.boolean() }).nullable(),
  trace: z.array(TraceStep),
  durationMs: z.number(),
  tool: z.object({ name: z.literal("nocap"), version: z.string() }),
});

export type Receipt = z.infer<typeof Receipt>;
export type TraceStep = z.infer<typeof TraceStep>;
export type ChainItemStatus = z.infer<typeof ChainItemStatus>;

/** Wire form used when publishing: unknown fields are stripped, not rejected. */
export const PublishReceipt = Receipt.strip();
