import { z } from "zod";

export const FileEvidence = z.object({
  kind: z.literal("file"),
  path: z.string(),
  status: z.enum(["A", "M", "D", "R", "U"]),
  additions: z.number(),
  deletions: z.number(),
  previousPath: z.string().nullable(),
});

export const HunkEvidence = z.object({
  kind: z.literal("hunk"),
  path: z.string(),
  startLine: z.number(),
  lines: z.array(z.string()).max(30),
});

export const MappingEvidence = z.object({
  kind: z.literal("mapping"),
  concept: z.string(),
  globs: z.array(z.string()),
  matchedFiles: z.number(),
  source: z.enum(["llm", "keyword", "user"]),
});

export const TestRunEvidence = z.object({
  kind: z.literal("testRun"),
  label: z.enum(["head", "reverted", "base", "suite"]),
  runner: z.string(),
  total: z.number(),
  passed: z.number(),
  failed: z.number(),
  skipped: z.number(),
  durationMs: z.number(),
  tests: z.array(z.object({ file: z.string(), title: z.string(), status: z.string() })).max(50),
});

export const CommandEvidence = z.object({
  kind: z.literal("command"),
  command: z.string(),
  exitCode: z.number(),
  durationMs: z.number(),
  stderrTail: z.string().max(2000),
});

export const CheckRunsEvidence = z.object({
  kind: z.literal("checkRuns"),
  sha: z.string(),
  total: z.number(),
  success: z.number(),
  failure: z.number(),
  pending: z.number(),
  names: z.array(z.string()).max(20),
});

export const NoteEvidence = z.object({
  kind: z.literal("note"),
  text: z.string(),
});

export const Evidence = z.discriminatedUnion("kind", [
  FileEvidence,
  HunkEvidence,
  MappingEvidence,
  TestRunEvidence,
  CommandEvidence,
  CheckRunsEvidence,
  NoteEvidence,
]);

export type Evidence = z.infer<typeof Evidence>;
export type FileEvidence = z.infer<typeof FileEvidence>;
export type HunkEvidence = z.infer<typeof HunkEvidence>;
export type MappingEvidence = z.infer<typeof MappingEvidence>;
export type TestRunEvidence = z.infer<typeof TestRunEvidence>;
export type CommandEvidence = z.infer<typeof CommandEvidence>;
export type CheckRunsEvidence = z.infer<typeof CheckRunsEvidence>;
export type NoteEvidence = z.infer<typeof NoteEvidence>;
