/** `pnpm docs:cli`: capture commander help for every command into apps/web/src/generated/cli-help.json (rendered on /docs). */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib/run-scenario";

const bin = join(ROOT, "apps", "cli", "dist", "index.js");
const help = (...args: string[]) => execFileSync("node", [bin, ...args, "--help"], { encoding: "utf8" }).trimEnd();
const top = help();
const names = [...top.matchAll(/^ {2}([a-z]+)\b/gm)].map((m) => m[1] as string).filter((n) => n !== "help");
const out = { root: top, commands: Object.fromEntries(names.map((n) => [n, help(n)])) };
const dir = join(ROOT, "apps", "web", "src", "generated");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "cli-help.json"), `${JSON.stringify(out, null, 2)}\n`);
console.log(`wrote ${names.length} commands`);
