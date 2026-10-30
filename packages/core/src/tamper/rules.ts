import type { Flag } from "../schema/verdict.js";
import type { ChangeSet, DiffHunk } from "../git/types.js";
import { isConfigPath, isTestPath } from "../git/classify.js";

const SKIP = /\.skip\(|\bxit\(|\bxdescribe\(|\bit\.todo\(|\btest\.skip|@pytest\.mark\.skip(?!if)|\bpytest\.skip\(/;
const ONLY = /\.only\(|\bfit\(|\bfdescribe\(/;
const ASSERT = /\bexpect\(|\bassert /g;
const STRICT = /toEqual|toStrictEqual|toBe\(/;
const LOOSE = /toBeTruthy|toBeDefined|toBeFalsy|not\.toThrow|toBeGreaterThanOrEqual\(0\)/;
const TRIVIAL = /expect\((true|1|"x")\)\.toBe\(\1\)|\bassert True\b/;
const CONFIG_TAMPER = /testPathIgnorePatterns|\bexclude\b|--deselect|addopts|fail_under|coverageThreshold|continue-on-error|\|\| true|"test"\s*:/;
const FORCED_EXIT = /process\.exit\(0\)|sys\.exit\(0\)|os\._exit/;
const ENV_SNIFF = /JEST_WORKER_ID|\bVITEST\b|PYTEST_CURRENT_TEST|NODE_ENV\s*===?\s*['"]test['"]/;
const EQ_OVERRIDE = /def __eq__/;

const count = (lines: string[], re: RegExp) => lines.reduce((n, l) => n + (l.match(re)?.length ?? 0), 0);

function flag(rule: string, path: string, line: number | null, detail: string, severity: Flag["severity"] = "warn"): Flag {
  return { rule, severity, path, line, detail };
}

function hunkFlags(hunk: DiffHunk, isTest: boolean, isConfig: boolean): Flag[] {
  const out: Flag[] = [];
  const added = hunk.lines.filter((l) => l.type === "add");
  const removed = hunk.lines.filter((l) => l.type === "del");
  const at = (l: { newLine: number | null; oldLine: number | null }) => l.newLine ?? l.oldLine;

  if (isTest) {
    for (const l of added) {
      if (SKIP.test(l.content)) out.push(flag("skip_added", hunk.path, at(l), l.content.trim()));
      if (ONLY.test(l.content)) out.push(flag("only_added", hunk.path, at(l), l.content.trim()));
      if (TRIVIAL.test(l.content)) out.push(flag("trivial_assertion", hunk.path, at(l), l.content.trim()));
      if (FORCED_EXIT.test(l.content)) out.push(flag("forced_exit", hunk.path, at(l), l.content.trim()));
    }
    const dropped = count(removed.map((l) => l.content), ASSERT) - count(added.map((l) => l.content), ASSERT);
    if (dropped >= 2) out.push(flag("assertions_removed", hunk.path, removed[0] ? at(removed[0]) : null, `${dropped} more assertions removed than added`));
    const strict = removed.find((l) => STRICT.test(l.content));
    const loose = added.find((l) => LOOSE.test(l.content));
    if (strict && loose) {
      const from = strict.content.match(STRICT)?.[0] ?? "strict";
      const to = loose.content.match(LOOSE)?.[0] ?? "loose";
      out.push(flag("assertion_loosened", hunk.path, at(loose), `${from.replace(/\($/, "")} → ${to}`));
    }
  }
  if (isConfig || isTest) {
    for (const l of added) {
      if (CONFIG_TAMPER.test(l.content) && (isConfig || /ignore|exclude|deselect|addopts/i.test(l.content))) {
        out.push(flag("test_config_changed", hunk.path, at(l), l.content.trim()));
      }
    }
    for (const l of removed) {
      if (/coverageThreshold|fail_under/.test(l.content) && isConfig) {
        out.push(flag("test_config_changed", hunk.path, at(l), `removed: ${l.content.trim()}`));
      }
    }
  }
  if (!isTest) {
    for (const l of added) {
      if (!isConfig && ENV_SNIFF.test(l.content)) out.push(flag("env_sniffing", hunk.path, at(l), l.content.trim()));
      if (/\.py$/.test(hunk.path) && EQ_OVERRIDE.test(l.content)) out.push(flag("eq_override", hunk.path, at(l), l.content.trim()));
      if (isConfig && FORCED_EXIT.test(l.content) && /setup|conftest/.test(hunk.path)) {
        out.push(flag("forced_exit", hunk.path, at(l), l.content.trim()));
      }
    }
  }
  return out;
}

export function tamperFlags(changeSet: ChangeSet): Flag[] {
  const flags: Flag[] = [];
  for (const file of changeSet.files) {
    if (file.status === "D" && isTestPath(file.path)) {
      flags.push(flag("test_file_deleted", file.path, null, `${file.path} was deleted`));
    }
  }
  const snaps = changeSet.files.filter((f) => f.path.endsWith(".snap") && f.status === "M");
  if (snaps.length >= 3) {
    flags.push(flag("snapshot_mass_update", snaps[0]?.path ?? "", null, `${snaps.length} snapshot files modified`));
  }
  for (const hunk of changeSet.hunks) {
    flags.push(...hunkFlags(hunk, isTestPath(hunk.path), isConfigPath(hunk.path)));
  }
  return flags.filter((f, i, all) => all.findIndex((o) => o.rule === f.rule && o.path === f.path && o.line === f.line) === i);
}
