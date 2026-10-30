#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { NOCAP_VERSION } from "@nocap/core";
import { runCheck, type CheckOptions } from "./commands/check.js";
import { startStdioServer } from "@nocap/mcp";
import { HOOK_AGENTS, type HookAgent, readStdinText, runHook } from "./commands/hook.js";
import { runInitClaude } from "./commands/init.js";
import { runInitAll } from "./commands/initAll.js";
import { runLoop } from "./commands/loop.js";
import { runHandoff, runScorecard } from "./commands/team.js";
import { runBitecheck, runChain } from "./commands/chain.js";
import { runConfig } from "./commands/config.js";
import { runDemo } from "./commands/demo.js";
import { runPublish } from "./commands/publish.js";
import { runRepair } from "./commands/repair.js";

const collect = (value: string, previous: string[]) => [...previous, value];

export function buildProgram(onExit: (code: number) => void = (code) => process.exit(code)): Command {
  const program = new Command();
  program.name("nocap").description("your agent says it's done. nocap checks.").version(NOCAP_VERSION);

  program
    .command("check")
    .description("verify an agent's summary against the repo in the current directory")
    .option("--summary <file|->", "summary file, or - for stdin (default: stdin when piped)")
    .option("--base <ref>", "base ref")
    .option("--head <ref>", "head ref (default: working-tree snapshot if dirty, else HEAD)")
    .option("--agent <name>", "agent name for the receipt")
    .option("--no-exec", "static checks only: never run tests or commands")
    .option("--offline", "never call an LLM")
    .option("--scope <concept=glob,glob>", "map a concept to globs (repeatable)", collect, [] as string[])
    .option("--test-cmd <cmd>", "custom test command with {files} and {out}")
    .option("--test-format <fmt>", "jest|junit (with --test-cmd)")
    .option("--json", "print the receipt as JSON")
    .option("--md", "print the receipt as markdown")
    .option("--out <file>", "also write the rendered output to a file")
    .option("--publish", "upload the receipt to NOCAP_API_URL")
    .option("--no-hunks", "omit diff hunks when publishing")
    .option("--strict", "exit 3 when the result is MIXED")
    .option("--repair", "print repair instructions for contradicted claims")
    .option("--actor <agent>", "acting agent")
    .option("--model <id>", "model id of the acting agent")
    .option("--role <name>", "role of the acting agent")
    .option("--verbose", "narrate each step")
    .option("--chain <id|auto|new>", "continue (or start) a proof chain across attempts")
    .option("--since-last", "judge only the delta since the previous receipt (per-agent attribution)")
    .option("--scope-role <role=globs>", "declare another role's scope (repeatable); touching it raises cross_agent_overlap", collect, [] as string[])
    .action(async (opts: CheckOptions) => {
      const { exitCode } = await runCheck(opts);
      onExit(exitCode);
    });

  program
    .command("demo [scenario]")
    .description("build a fixture scenario in .cache and verify it with live output")
    .option("--no-exec", "static checks only")
    .action(async (scenario: string | undefined, opts: { exec: boolean }) => onExit(await runDemo(scenario ?? "toothless", opts)));

  program
    .command("loop")
    .description("closed repair loop: check, hand the repair packet to your agent, re-check")
    .requiredOption("--agent-cmd <cmd>", "agent command; {repair_file} is replaced by the repair packet path")
    .option("--summary <file|->", "initial summary (default: stdin when piped)")
    .option("--summary-from <source>", "where the agent's next summary comes from: stdout | file:<path>", "stdout")
    .option("--max <n>", "maximum attempts", "3")
    .option("--no-exec", "static checks only")
    .option("--agent <name>", "agent name for the receipts")
    .option("--base <ref>", "base ref")
    .option("--verbose", "narrate each step")
    .action(async (opts) => onExit(await runLoop(opts)));

  program
    .command("hook <agent>")
    .description("agent hook entrypoint (JSON on stdin, or as the last argument for codex notify): claude (Stop), codex (notify), gemini (AfterAgent)")
    .argument("[payload]", "JSON payload (codex passes it as an argument)")
    .action(async (agent: string, payload?: string) => {
      if (!(HOOK_AGENTS as readonly string[]).includes(agent)) {
        process.stderr.write(`nocap: hook '${agent}' is not supported. Use one of: ${HOOK_AGENTS.join(", ")}.\n`);
        return onExit(2);
      }
      const stdin = payload ?? (await readStdinText());
      onExit(await runHook({ stdin, stdout: (t) => process.stdout.write(t), stderr: (t) => process.stderr.write(t) }, process.env, agent as HookAgent));
    });

  program
    .command("init [agent]")
    .description("wire nocap into your agents: `init --all` detects them all; `init claude` installs only the Claude Code hook")
    .option("--all", "detect every installed agent and configure MCP + hooks + AGENTS.md")
    .option("--write", "apply the changes (default is a dry run)")
    .option("--user", "allow writing user-level config (needed for Codex)")
    .action(async (agent: string | undefined, opts: { all?: boolean; write?: boolean; user?: boolean }) => {
      if (opts.all || agent === "all") {
        return onExit(await runInitAll({ write: opts.write === true, user: opts.user === true, env: { cwd: process.cwd(), home: process.env.HOME ?? "", path: process.env.PATH ?? "" } }));
      }
      if (agent !== "claude") {
        process.stderr.write(`nocap: init '${agent}' is not supported yet.\n`);
        return onExit(2);
      }
      onExit(await runInitClaude({ write: opts.write === true, user: opts.user === true }));
    });

  program
    .command("mcp")
    .description("start the MCP stdio server (verify_claims, get_repair, bitecheck, check_scope, ...)")
    .action(async () => {
      await startStdioServer();
    });

  program
    .command("bitecheck <testFiles...>")
    .description("prove specific tests bite: they must fail without the source change")
    .option("--base <ref>", "base ref")
    .action(async (files: string[], opts: { base?: string }) => onExit(await runBitecheck(files, opts)));

  program
    .command("chain [chainId]")
    .description("print the proof-chain timeline (default: the latest chain)")
    .action(async (chainId: string | undefined) => onExit(await runChain(chainId)));

  program
    .command("handoff")
    .description("what the next agent can trust, must not rely on, and what is stale (from the ledger)")
    .option("--to <role>", "role of the agent receiving the work")
    .action(async (opts: { to?: string }) => onExit(await runHandoff(opts.to)));

  program
    .command("scorecard")
    .description("per agent+model accuracy from local receipts")
    .action(async () => onExit(await runScorecard()));

  program
    .command("config <action> [args...]")
    .description("set or show settings: `config set llm-key <key>`, `config get` (the key is never printed)")
    .action((action: string, args: string[]) => onExit(runConfig(action, args)));

  program
    .command("repair [receiptFile]")
    .description("print repair instructions from the last (or a given) receipt")
    .option("--json", "print the repair packet as JSON")
    .action(async (file: string | undefined, opts: { json?: boolean }) => onExit(await runRepair(file, opts.json === true)));

  program
    .command("publish <receiptFile>")
    .description("upload an existing receipt")
    .option("--no-hunks", "omit diff hunks")
    .action(async (file: string, opts: { hunks: boolean }) => onExit(await runPublish(file, { noHunks: !opts.hunks })));

  return program;
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  void buildProgram().parseAsync(process.argv).catch((error: unknown) => {
    process.stderr.write(`nocap: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  });
}
