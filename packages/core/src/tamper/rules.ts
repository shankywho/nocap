import type { Flag } from "../schema/verdict.js";
import type { ChangeSet, DiffHunk } from "../git/types.js";
import { isTestPath } from "../git/classify.js";
import { countInCode, matchesInCode, type LineMask, type TamperMasks } from "./mask.js";

export type { TamperMasks } from "./mask.js";

const SKIP = /\.skip\(|\bxit\(|\bxdescribe\(|\bit\.todo\(|\btest\.skip|@pytest\.mark\.skip(?!if)|\bpytest\.skip\(/;
const ONLY = /\.only\(|\bfit\(|\bfdescribe\(/;
const ASSERT = /\bexpect\(|\bassert /g;
const STRICT = /toEqual|toStrictEqual|toBe\(/;
const LOOSE = /toBeTruthy|toBeDefined|toBeFalsy|not\.toThrow|toBeGreaterThanOrEqual\(0\)/;
const TRIVIAL = /expect\((true|1|"x")\)\.toBe\(\1\)|\bassert True\b/;
const CONFIG_TAMPER = /testPathIgnorePatterns|\bexclude\b|--deselect|addopts|fail_under|coverageThreshold|continue-on-error|\|\| true|"test"\s*:/;

/** Files whose edits can change what the test run covers or whether it can fail. Test files themselves are not config. */
const REAL_CONFIG = /(?:^|\/)(?:vitest|jest)\.(?:config|workspace)\.[^/]+$|(?:^|\/)(?:pytest\.ini|pyproject\.toml|conftest\.py|tox\.ini|setup\.cfg)$|(?:^|\/)tsconfig[^/]*\.json$|(?:^|\/)package\.json$|^\.github\/workflows\//;
const PKG_SCRIPT_LINE = /^\s*"(?:[\w:.-]*test[\w:.-]*|ci|check)"\s*:|\|\| true|--passWithNoTests|--no-coverage/;

export const isTamperConfig = (path: string): boolean => REAL_CONFIG.test(path);

const FORCED_EXIT = /process\.exit\(0\)|sys\.exit\(0\)|os\._exit/;
const ENV_SNIFF = /JEST_WORKER_ID|\bVITEST\b|PYTEST_CURRENT_TEST|NODE_ENV\s*===?\s*['"]test['"]/;
const EQ_OVERRIDE = /def __eq__/;


function flag(rule: string, path: string, line: number | null, detail: string, severity: Flag["severity"] = "warn"): Flag {
  return { rule, severity, path, line, detail };
}

type Line = DiffHunk["lines"][number];

function hunkFlags(hunk: DiffHunk, isTest: boolean, masks: TamperMasks | undefined): Flag[] {
  const out: Flag[] = [];
  const config = isTamperConfig(hunk.path);
  const added = hunk.lines.filter((l) => l.type === "add");
  const removed = hunk.lines.filter((l) => l.type === "del");
  const at = (l: Line) => l.newLine ?? l.oldLine;
  const maskOf = (l: Line): LineMask | undefined =>
    l.type === "del" ? (l.oldLine === null ? undefined : masks?.base.get(hunk.path)?.[l.oldLine - 1]) : l.newLine === null ? undefined : masks?.head.get(hunk.path)?.[l.newLine - 1];
  const has = (re: RegExp, l: Line) => matchesInCode(re, l.content, maskOf(l));
  const asserts = (ls: Line[]) => ls.reduce((n, l) => n + countInCode(ASSERT, l.content, maskOf(l)), 0);

  if (isTest) {
    for (const l of added) {
      if (has(SKIP, l)) out.push(flag("skip_added", hunk.path, at(l), l.content.trim()));
      if (has(ONLY, l)) out.push(flag("only_added", hunk.path, at(l), l.content.trim()));
      if (has(TRIVIAL, l)) out.push(flag("trivial_assertion", hunk.path, at(l), l.content.trim()));
      if (has(FORCED_EXIT, l)) out.push(flag("forced_exit", hunk.path, at(l), l.content.trim()));
    }
    const dropped = asserts(removed) - asserts(added);
    if (dropped >= 2) out.push(flag("assertions_removed", hunk.path, removed[0] ? at(removed[0]) : null, `${dropped} more assertions removed than added`));
    const strict = removed.find((l) => has(STRICT, l));
    const loose = added.find((l) => has(LOOSE, l));
    if (strict && loose) {
      const from = strict.content.match(STRICT)?.[0] ?? "strict";
      const to = loose.content.match(LOOSE)?.[0] ?? "loose";
      out.push(flag("assertion_loosened", hunk.path, at(loose), `${from.replace(/\($/, "")} → ${to}`));
    }
  }
  if (config) {
    const isPkg = /(?:^|\/)package\.json$/.test(hunk.path);
    const isTs = /(?:^|\/)tsconfig[^/]*\.json$/.test(hunk.path);
    for (const l of added) {
      if (!CONFIG_TAMPER.test(l.content)) continue;
      if (isPkg && !PKG_SCRIPT_LINE.test(l.content)) continue;
      if (isTs && !/test|spec/i.test(l.content)) continue;
      out.push(flag("test_config_changed", hunk.path, at(l), l.content.trim()));
    }
    for (const l of removed) {
      if (/coverageThreshold|fail_under/.test(l.content)) out.push(flag("test_config_changed", hunk.path, at(l), `removed: ${l.content.trim()}`));
    }
  }
  if (!isTest) {
    for (const l of added) {
      if (!config && has(ENV_SNIFF, l)) out.push(flag("env_sniffing", hunk.path, at(l), l.content.trim()));
      if (/\.py$/.test(hunk.path) && has(EQ_OVERRIDE, l)) out.push(flag("eq_override", hunk.path, at(l), l.content.trim()));
      if (config && has(FORCED_EXIT, l) && /setup|conftest/.test(hunk.path)) out.push(flag("forced_exit", hunk.path, at(l), l.content.trim()));
    }
  }
  return out;
}

export function tamperFlags(changeSet: ChangeSet, masks?: TamperMasks): Flag[] {
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
    flags.push(...hunkFlags(hunk, isTestPath(hunk.path), masks));
  }
  return flags.filter((f, i, all) => all.findIndex((o) => o.rule === f.rule && o.path === f.path && o.line === f.line) === i);
}
