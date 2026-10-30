#!/usr/bin/env node
import { Command } from "commander";
import { NOCAP_VERSION } from "@nocap/core";

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("nocap")
    .description("your agent says it's done. nocap checks.")
    .version(NOCAP_VERSION);
  return program;
}

const isDirectRun = process.argv[1]?.endsWith("index.js") || process.argv[1]?.endsWith("index.ts");

if (isDirectRun) {
  buildProgram().parse(process.argv);
}