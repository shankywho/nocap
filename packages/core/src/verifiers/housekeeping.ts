import type { Claim } from "../schema/claim.js";
import type { Evidence } from "../schema/evidence.js";
import type { Verdict } from "../schema/verdict.js";
import { contradicted, fileEvidence, hunkEvidence, unverifiable, verified, type VerifyContext } from "./helpers.js";

/** `"version": "1.2.3"`, `version = "1.2.3"` (pyproject, Cargo, setup.cfg) and `export const X_VERSION = "1.2.3"`. */
const VERSION_LINE = [/^\s*["']?version["']?\s*[:=]\s*["']v?(\d+\.\d+\.\d+[^"',\s]*)["']/i, /\b[A-Z_]*VERSION\s*(?:=|:\s*string\s*=)\s*["']v?(\d+\.\d+\.\d+[^"']*)["']/];

function versionOf(line: string): string | null {
  for (const re of VERSION_LINE) {
    const m = re.exec(line);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** "bumped version to X": a version field in the diff must change, and to X when X is given. */
export function verifyVersionBump(claim: Claim, ctx: VerifyContext): Verdict {
  const wanted = claim.subject?.replace(/^v/, "") ?? null;
  const changes: { path: string; to: string; hunk: ReturnType<typeof hunkEvidence> }[] = [];
  for (const hunk of ctx.changeSet.hunks) {
    for (const l of hunk.lines) {
      if (l.type !== "add") continue;
      const to = versionOf(l.content);
      if (to) changes.push({ path: hunk.path, to, hunk: hunkEvidence(hunk) });
    }
  }
  if (changes.length === 0) {
    return contradicted("No version field changed in the diff.", [{ kind: "note", text: "looked for a version line in package.json, pyproject.toml, Cargo.toml, setup.cfg and *_VERSION constants" }]);
  }
  const evidenceFor = (items: typeof changes): Evidence[] => {
    const seen = new Set<string>();
    const out: Evidence[] = [];
    for (const c of items.slice(0, 6)) {
      const file = ctx.changeSet.files.find((f) => f.path === c.path);
      if (file && !seen.has(c.path)) {
        seen.add(c.path);
        out.push(fileEvidence(file));
      }
      out.push(c.hunk);
    }
    return out;
  };
  if (wanted === null) return verified(`Version changed to ${[...new Set(changes.map((c) => c.to))].join(", ")} in ${[...new Set(changes.map((c) => c.path))].join(", ")}.`, evidenceFor(changes));
  const match = changes.filter((c) => c.to === wanted);
  if (match.length > 0) return verified(`Version is ${wanted} in ${[...new Set(match.map((c) => c.path))].join(", ")}.`, evidenceFor(match));
  return contradicted(`Version changed to ${[...new Set(changes.map((c) => c.to))].join(", ")}, not ${wanted}.`, evidenceFor(changes));
}

const GOLDEN = /(?:^|\/)(?:__snapshots__|__golden__|__goldens__|goldens?|snapshots?)\/|\.snap$|\.golden(?:\.[\w.]+)?$|\.expected\.[\w.]+$|(?:^|\/)expected\.[\w.]+$/i;

export const isGoldenPath = (path: string): boolean => GOLDEN.test(path);

/**
 * "regenerated goldens / updated snapshots": the changed golden or snapshot files are the evidence, which also stops them
 * showing up as undisclosed. If none changed, regeneration may simply have produced identical output, so this is `!`, not ✗.
 */
export function verifySnapshotsUpdated(_claim: Claim, ctx: VerifyContext): Verdict {
  const files = ctx.changeSet.files.filter((f) => isGoldenPath(f.path));
  if (files.length === 0) {
    return unverifiable("No golden or snapshot files changed in the diff (regenerating can produce identical output).");
  }
  // Every path goes in as evidence (capped at 200): undisclosed detection treats evidence paths as covered.
  const shown = files.slice(0, 200);
  const extra = files.length > shown.length ? [{ kind: "note" as const, text: `…and ${files.length - shown.length} more golden or snapshot files` }] : [];
  return verified(`${files.length} golden or snapshot file${files.length === 1 ? "" : "s"} changed.`, [...shown.map(fileEvidence), ...extra]);
}
