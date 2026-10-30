import type { Evidence, FileEvidence } from "../schema/evidence.js";
import { isLockPath } from "../git/classify.js";

export const MAX_UNDISCLOSED_LINES = 15;

export interface UndisclosedView {
  files: FileEvidence[];
  lockfiles: string[];
  /** Files beyond the cap; the full list stays in the receipt JSON. */
  more: number;
}

/** Splits undisclosed changes for display: lockfiles collapse into one quiet line, the rest is capped. */
export function undisclosedView(undisclosed: Evidence[], max = MAX_UNDISCLOSED_LINES): UndisclosedView {
  const files = undisclosed.filter((e): e is FileEvidence => e.kind === "file");
  const lockfiles = files.filter((f) => isLockPath(f.path)).map((f) => f.path);
  const rest = files.filter((f) => !isLockPath(f.path));
  return { files: rest.slice(0, max), lockfiles, more: Math.max(0, rest.length - max) };
}
