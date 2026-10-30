#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { NOCAP_VERSION } from "@nocap/core";
import { runCheck, type CheckOptions } from "./commands/check.js";
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
