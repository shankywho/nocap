export type ChangeStatus = "A" | "M" | "D" | "R" | "U";

export interface ChangedFile {
  path: string;
  status: ChangeStatus;
  additions: number;
  deletions: number;
  previousPath: string | null;
  isBinary: boolean;
}

export interface DiffLine {
  type: "add" | "del" | "normal";
  content: string;
  oldLine: number | null;
  newLine: number | null;
}

export interface DiffHunk {
  path: string;
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
}

export interface ChangeSet {
  baseSha: string;
  headSha: string;
  files: ChangedFile[];
  hunks: DiffHunk[];
}

export function fileByPath(changeSet: ChangeSet, path: string): ChangedFile | undefined {
  return changeSet.files.find((file) => file.path === path);
}

export function changedPaths(changeSet: ChangeSet): string[] {
  return changeSet.files.map((file) => file.path).sort();
}
