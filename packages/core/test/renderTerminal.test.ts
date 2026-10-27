import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Receipt } from "../src/schema/receipt";
import { renderTerminal } from "../src/render/terminal";
import { renderMarkdown } from "../src/render/markdown";

const load = (n: string) => Receipt.parse(JSON.parse(readFileSync(new URL(`./__golden__/${n}.noexec.json`, import.meta.url), "utf8")));

function golden(name: string, text: string) {
  const url = new URL(`./__golden__/${name}`, import.meta.url);
  if (process.env.UPDATE_GOLDEN) writeFileSync(url, `${text}\n`);
  expect(`${text}\n`).toBe(readFileSync(url, "utf8"));
}

describe("render goldens (NO_COLOR)", () => {
  it.each(["scope_violation", "tampered", "denominator"])("terminal %s", (n) => {
    const text = renderTerminal(load(n));
    expect(text).not.toContain("\u001b");
    golden(`${n}.terminal.txt`, text);
  });
  it.each(["scope_violation", "tampered"])("markdown %s", (n) => golden(`${n}.md`, renderMarkdown(load(n))));
});

describe("RESULT line model label", () => {
  const base = load("denominator");
  it("says offline for the regex extractor and names the model otherwise", () => {
    const offline = renderTerminal({ ...base, model: { provider: "offline", id: "regex", degraded: false } }, { color: false });
    expect(offline).toContain("· offline");
    const live = renderTerminal({ ...base, model: { provider: "groq", id: "openai/gpt-oss-120b", degraded: false } }, { color: false });
    expect(live).toContain("· gpt-oss-120b@groq");
    const degraded = renderTerminal({ ...base, model: { provider: "groq", id: "openai/gpt-oss-120b", degraded: true } }, { color: false });
    expect(degraded).toContain("· offline");
  });
});
