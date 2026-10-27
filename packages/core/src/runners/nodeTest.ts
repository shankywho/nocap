/** Support for Node's built-in runner (`node --test`). */

const SEPARATOR = /\s*(?:&&|\|\||;|\|)\s*/;

export interface NodeTestScript {
  /** Flags that sit before `--test` (for example `--import tsx`), kept so the project's own loader setup still applies. */
  nodeArgs: string[];
  /** Flags after `--test` (for example `--test-concurrency=1`). */
  testFlags: string[];
  /** Files, directories or globs the script runs. */
  targets: string[];
}

/** Finds a `node … --test …` command in a package.json script, or null. */
export function parseNodeTestScript(script: string): NodeTestScript | null {
  for (const part of script.split(SEPARATOR)) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    const node = tokens.findIndex((t) => t === "node" || t.endsWith("/node"));
    if (node === -1) continue;
    const test = tokens.findIndex((t, i) => i > node && t === "--test");
    if (test === -1) continue;
    const after = tokens.slice(test + 1);
    return {
      nodeArgs: tokens.slice(node + 1, test),
      testFlags: after.filter((t) => t.startsWith("-") && !t.startsWith("--test-reporter") && !t.startsWith("--test-name-pattern")),
      targets: after.filter((t) => !t.startsWith("-")),
    };
  }
  return null;
}

export const isNodeTestScript = (script: string): boolean => parseNodeTestScript(script) !== null;

/** Arguments for one run: junit reporter to a file, optional name filter, then the files (or the script's own targets). */
export function nodeTestArgs(script: NodeTestScript, outFile: string, files: string[], namePattern: string | null): string[] {
  return [
    ...script.nodeArgs,
    "--test",
    ...script.testFlags,
    "--test-reporter=junit",
    `--test-reporter-destination=${outFile}`,
    ...(namePattern ? [`--test-name-pattern=${namePattern}`] : []),
    ...(files.length > 0 ? files : script.targets),
  ];
}

/** True when the Node version in use rejects the junit reporter (older Node). */
export const junitReporterMissing = (stderr: string): boolean => /Could not find '?junit'?|ERR_MODULE_NOT_FOUND.*junit|Cannot find module.*junit|bad option: --test-reporter/i.test(stderr);
