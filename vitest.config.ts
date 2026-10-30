import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@nocap/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
      "@nocap/mcp": fileURLToPath(new URL("./packages/mcp/src/server.ts", import.meta.url)),
      "@web": fileURLToPath(new URL("./apps/web", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: [
      "packages/*/test/**/*.test.ts",
      "apps/cli/test/**/*.test.ts",
      "apps/web/test/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/.cache/**", "**/e2e/**"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});