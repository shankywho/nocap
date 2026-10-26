/**
 * MCP server entrypoint. The tool surface is implemented in P8; this module
 * only pins the process contract so the package builds from day one.
 */
export const MCP_SERVER_NAME = "nocap";

export function mcpServerInfo(): { name: string; version: string } {
  return { name: MCP_SERVER_NAME, version: "0.1.0" };
}