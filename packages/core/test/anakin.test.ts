import { describe, expect, it } from "vitest";
import { ANAKIN_MCP_URL, callAnakinTool, verifyExternalDocumentation } from "../src/adapters/anakin.js";

describe("Anakin MCP Adapter (https://mcp.anakin.io/mcp)", () => {
  it("exposes the official remote endpoint URL", () => {
    expect(ANAKIN_MCP_URL).toBe("https://mcp.anakin.io/mcp");
  });

  it("returns unverifiable when no API key is provided", async () => {
    const res = await verifyExternalDocumentation({
      claim: "Migrated to Next.js 15 async cookies() API",
      url: "https://nextjs.org/docs",
      config: { apiKey: "" },
    });
    expect(res.status).toBe("unverifiable");
    expect(res.reason).toContain("No ANAKIN_API_KEY configured");
  });

  it("throws in callAnakinTool when no API key is present", async () => {
    await expect(
      callAnakinTool("scrape", { url: "https://example.com" }, { apiKey: "" })
    ).rejects.toThrow("ANAKIN_API_KEY is required");
  });

  it("verifies a claim when authoritative docs scraped via Anakin match keywords", async () => {
    const mockFetch = async () =>
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          result: {
            content: [
              {
                type: "text",
                text: "In Next.js 15, cookies() and headers() from next/headers are now async functions returning a Promise.",
              },
            ],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    const res = await verifyExternalDocumentation({
      claim: "Next.js 15 cookies() from next/headers are async functions",
      url: "https://nextjs.org/docs/app/api-reference/functions/cookies",
      config: {
        apiKey: "ask_test_123",
        fetchFn: mockFetch as unknown as typeof fetch,
      },
    });

    expect(res.status).toBe("verified");
    expect(res.reason).toContain("Verified against live documentation via Anakin MCP");
    expect(res.evidence).toContain("cookies()");
  });

  it("detects contradiction when documentation marks a claimed feature as deprecated or removed", async () => {
    const mockFetch = async () =>
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          result: {
            content: [
              {
                type: "text",
                text: "Warning: createIdempotentCharge has been deprecated and removed in Stripe API v2024-10-28.",
              },
            ],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    const res = await verifyExternalDocumentation({
      claim: "Used createIdempotentCharge in Stripe v2024-10-28",
      url: "https://docs.stripe.com/api",
      config: {
        apiKey: "ask_test_123",
        fetchFn: mockFetch as unknown as typeof fetch,
      },
    });

    expect(res.status).toBe("contradicted");
    expect(res.reason).toContain("deprecated or removed");
  });
});
