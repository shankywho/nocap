import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../../../plugins/nocap/${p}`, import.meta.url), "utf8");

describe("Alan plugin", () => {
  it("manifest points at files that exist and the mcp server is nocap", () => {
    const manifest = JSON.parse(read(".cursor-plugin/plugin.json"));
    expect(manifest.name).toBe("nocap");
    expect(manifest.mcpServers).toBe("./mcp.json");
    expect(JSON.parse(read("mcp.json")).mcpServers.nocap.args).toEqual(["-y", "nocap", "mcp"]);
    expect(read("logo.svg")).toContain("<svg");
  });
  it("skill has frontmatter and names the protocol tools", () => {
    const skill = read("skills/nocap-verify/SKILL.md");
    expect(skill).toMatch(/^---\nname: nocap-verify\ndescription: .+\n---/);
    for (const t of ["verify_claims", "get_repair", "bitecheck", "ledger_facts", "mcp__alan__create_test_report", "Retracted:"]) expect(skill).toContain(t);
  });
});
