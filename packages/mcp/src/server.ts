#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { Env } from "@nocap/core/adapters";
import * as tools from "./tools.js";

export const MCP_SERVER_NAME = "nocap";
export const MCP_SERVER_VERSION = "0.1.2";

export function mcpServerInfo(): { name: string; version: string } {
  return { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION };
}

const repo = z.string().describe("Absolute path of the git repository");
const base = z.string().optional().describe("Base ref (default: merge-base with the default branch, or HEAD~1)");

export function createServer(env: Env = process.env): McpServer {
  const server = new McpServer(mcpServerInfo());

  server.registerTool(
    "verify_claims",
    {
      description:
        "Verify a coding agent's completion summary against the git repo: extracts claims, checks them against the diff, re-runs tests and proves new tests catch the change (Bitecheck). Call this BEFORE telling the user you are done. If it fails, call get_repair, fix the issues and call it again.",
      inputSchema: {
        summary: z.string().describe("Your completion summary, exactly as you will send it"),
        repo_path: repo,
        base,
        exec: z.boolean().optional().describe("Run tests and Bitecheck (default true)"),
        chain: z.string().optional().describe("Proof chain: an id, 'auto' (default) or 'new'"),
        actor: z.string().optional().describe("Your agent name"),
        model: z.string().optional(),
        role: z.string().optional().describe("Your role on a multi-agent task, e.g. backend"),
        since_last: z.boolean().optional().describe("Judge only the delta since the previous receipt, so you are not blamed for a teammate's files"),
      },
    },
    (args) => tools.verifyClaims(args, env),
  );

  server.registerTool(
    "get_repair",
    {
      description: "Get the repair packet for the latest failed verification: one item per contradicted claim, with what to change and when it is done. Call it after verify_claims returns fail.",
      inputSchema: { repo_path: repo, receipt_id: z.string().optional() },
    },
    (args) => tools.getRepair(args),
  );

  server.registerTool(
    "bitecheck",
    {
      description: "Mid-task check: do the tests you just wrote actually fail without your source change? Call it on new test files before claiming they cover anything.",
      inputSchema: { repo_path: repo, test_files: z.array(z.string()).min(1).describe("Repo-relative test files"), base },
    },
    (args) => tools.bitecheck(args, env),
  );

  server.registerTool(
    "check_scope",
    {
      description: "Mid-task check: did I touch this area? Maps a concept like 'auth' to files and lists which of them changed.",
      inputSchema: { repo_path: repo, concept: z.string(), base },
    },
    (args) => tools.checkScope(args, env),
  );

  server.registerTool(
    "ledger_facts",
    {
      description: "Call this at the START of a task, before relying on anything another agent said. Returns trusted facts (verified and still current), warnings (claims contradicted by evidence) and stale facts (the code changed since).",
      inputSchema: { repo_path: repo, query: z.string().optional().describe("Keywords of your task, e.g. 'backoff computeDelay'") },
    },
    (args) => tools.ledgerFacts(args),
  );

  server.registerTool(
    "ledger_check",
    {
      description: "A teammate said X. Is it proven? Extracts the claims from the statement and answers each from the ledger: verified by <actor>, CONTRADICTED by evidence, or unverified.",
      inputSchema: { repo_path: repo, statement: z.string() },
    },
    (args) => tools.ledgerCheck(args),
  );

  server.registerTool(
    "scorecard",
    {
      description: "Accuracy table per agent and model on this repo: verified, contradicted and unverifiable claim rates, bite rate, repair success, silent drops.",
      inputSchema: { repo_path: repo },
    },
    (args) => tools.scorecard(args),
  );

  return server;
}

export async function startStdioServer(env: Env = process.env): Promise<void> {
  await createServer(env).connect(new StdioServerTransport());
}

const entry = process.argv[1] ?? "";
if (entry.endsWith("server.js") || entry.endsWith("nocap-mcp")) {
  startStdioServer().catch((error: unknown) => {
    process.stderr.write(`nocap-mcp: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
