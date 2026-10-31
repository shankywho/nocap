/**
 * Anakin MCP Adapter (https://mcp.anakin.io/mcp)
 *
 * Bridges nocap's zero-trust verification engine with Anakin's web intelligence
 * and live scraping tools to verify agent claims about external documentation,
 * SDK signatures, and library migration specifications.
 */

export const ANAKIN_MCP_URL = "https://mcp.anakin.io/mcp";

export interface AnakinConfig {
  apiKey?: string | undefined;
  endpointUrl?: string | undefined;
  fetchFn?: typeof fetch | undefined;
}

export interface AnakinToolCallResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

export interface ExternalDocVerification {
  status: "verified" | "contradicted" | "unverifiable";
  claim: string;
  sourceUrl?: string | undefined;
  evidence: string;
  reason: string;
}

/**
 * Call a remote tool on the Anakin MCP server over JSON-RPC.
 */
export async function callAnakinTool(
  toolName: string,
  toolArgs: Record<string, unknown>,
  config: AnakinConfig = {}
): Promise<AnakinToolCallResult> {
  const apiKey = config.apiKey ?? (typeof process !== "undefined" ? process.env?.ANAKIN_API_KEY : undefined);
  if (!apiKey) {
    throw new Error("ANAKIN_API_KEY is required to query https://mcp.anakin.io/mcp");
  }

  const endpoint = config.endpointUrl ?? ANAKIN_MCP_URL;
  const doFetch = config.fetchFn ?? fetch;

  const payload = {
    jsonrpc: "2.0",
    id: Date.now(),
    method: "tools/call",
    params: {
      name: toolName,
      arguments: toolArgs,
    },
  };

  const response = await doFetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Anakin MCP responded with status ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as { result?: AnakinToolCallResult; error?: { message: string } };
  if (data.error) {
    throw new Error(`Anakin MCP error: ${data.error.message}`);
  }

  return data.result ?? { content: [{ type: "text", text: "" }] };
}

/**
 * Verify a claim referencing external documentation or an external API spec
 * using Anakin's web search & scraping capabilities.
 */
export async function verifyExternalDocumentation(
  args: {
    claim: string;
    url?: string | undefined;
    config?: AnakinConfig | undefined;
  }
): Promise<ExternalDocVerification> {
  const { claim, url, config = {} } = args;
  const apiKey = config.apiKey ?? (typeof process !== "undefined" ? process.env?.ANAKIN_API_KEY : undefined);

  if (!apiKey) {
    return {
      status: "unverifiable",
      claim,
      sourceUrl: url,
      evidence: "",
      reason: "No ANAKIN_API_KEY configured. Connect https://mcp.anakin.io/mcp to verify external web claims.",
    };
  }

  try {
    let docText = "";
    let sourceUrl = url;

    if (url) {
      // Direct scrape of the target documentation URL
      const scrapeResult = await callAnakinTool("scrape", { url }, config);
      docText = scrapeResult.content.map((c) => c.text ?? "").join("\n");
    } else {
      // Use agentic search to find and verify the authoritative specification
      const searchResult = await callAnakinTool(
        "agentic_search",
        { query: `Verify API specification or documentation: ${claim}` },
        config
      );
      docText = searchResult.content.map((c) => c.text ?? "").join("\n");
      sourceUrl = "https://mcp.anakin.io/search";
    }

    if (!docText.trim()) {
      return {
        status: "unverifiable",
        claim,
        sourceUrl,
        evidence: "",
        reason: "Anakin MCP returned empty content for the documentation query.",
      };
    }

    // Check for explicit contradiction indicators in the scraped text
    const lower = docText.toLowerCase();
    const claimLower = claim.toLowerCase();

    const isDeprecatedOrRemoved =
      lower.includes("deprecated") ||
      lower.includes("removed in") ||
      lower.includes("does not exist") ||
      lower.includes("404 not found");

    if (isDeprecatedOrRemoved && !claimLower.includes("deprecated")) {
      return {
        status: "contradicted",
        claim,
        sourceUrl,
        evidence: docText.slice(0, 300),
        reason: "Authoritative documentation scraped via Anakin indicates the feature or API is deprecated or removed.",
      };
    }

    // Check for corroborating terms
    const keywords = claim
      .replace(/[^a-zA-Z0-9_\-.]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3);

    const matches = keywords.filter((k) => lower.includes(k.toLowerCase()));
    const matchRatio = keywords.length > 0 ? matches.length / keywords.length : 0;

    if (matchRatio >= 0.5) {
      return {
        status: "verified",
        claim,
        sourceUrl,
        evidence: docText.slice(0, 300),
        reason: `Verified against live documentation via Anakin MCP (${matches.join(", ")} found).`,
      };
    }

    return {
      status: "unverifiable",
      claim,
      sourceUrl,
      evidence: docText.slice(0, 300),
      reason: "Documentation was fetched via Anakin MCP but lacked conclusive matching tokens.",
    };
  } catch (err) {
    return {
      status: "unverifiable",
      claim,
      sourceUrl: url,
      evidence: "",
      reason: `Anakin MCP call failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
