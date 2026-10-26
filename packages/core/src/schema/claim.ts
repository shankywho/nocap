import { z } from "zod";

export const ClaimType = z.enum([
  "file_created",
  "file_modified",
  "file_deleted",
  "file_renamed",
  "scope_none",
  "scope_only",
  "tests_added",
  "tests_pass",
  "build_pass",
  "symbol_added",
  "dependency_added",
  "dependency_removed",
  "bug_fixed",
  "refactor_no_behavior_change",
  "count_files_changed",
  "other",
]);

export type ClaimType = z.infer<typeof ClaimType>;

export const Claim = z.object({
  id: z.string(),
  quote: z.string().min(3),
  type: ClaimType,
  subject: z.string().nullable(),
  keywords: z.array(z.string()),
  paths: z.array(z.string()),
  symbols: z.array(z.string()),
  count: z.number().int().nullable(),
  command: z.string().nullable(),
  span: z.tuple([z.number(), z.number()]).nullable(),
});

export type Claim = z.infer<typeof Claim>;