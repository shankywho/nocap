import { join } from "node:path";
import type { FsPort } from "../ports.js";
import type { RunnerName } from "./types.js";

export async function detectRunner(fs: FsPort, root: string): Promise<RunnerName | null> {
  const has = (name: string) => fs.exists(join(root, name));
  const entries = await fs.readdir(root).catch(() => [] as string[]);
  if (entries.some((e) => /^vitest\.config\./.test(e))) return "vitest";
  if (entries.some((e) => /^jest\.config\./.test(e))) return "jest";

  if (await has("package.json")) {
    try {
      const pkg = JSON.parse(await fs.readFile(join(root, "package.json"))) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        scripts?: Record<string, string>;
        jest?: unknown;
      };
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if ("vitest" in deps) return "vitest";
      if ("jest" in deps || pkg.jest !== undefined) return "jest";
      const script = pkg.scripts?.test ?? "";
      if (/\bvitest\b/.test(script)) return "vitest";
      if (/\bjest\b/.test(script)) return "jest";
    } catch {
      // fall through to python detection
    }
  }
  if ((await has("pytest.ini")) || (await has("conftest.py"))) return "pytest";
  if (await has("pyproject.toml")) {
    const text = await fs.readFile(join(root, "pyproject.toml")).catch(() => "");
    if (/\[tool\.pytest/.test(text)) return "pytest";
  }
  return null;
}
