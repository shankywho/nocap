import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const coreSrc = fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url));
const coreWebAdaptersSrc = fileURLToPath(new URL("./packages/core/src/adapters/web.ts", import.meta.url));
const coreAdaptersSrc = fileURLToPath(new URL("./packages/core/src/adapters/index.ts", import.meta.url));
const mcpSrc = fileURLToPath(new URL("./packages/mcp/src/server.ts", import.meta.url));

export default defineConfig({
  resolve: {
    // Order matters: the more specific subpath must come first.
    alias: [
      { find: "@nocap/core/adapters/web", replacement: coreWebAdaptersSrc },
      { find: "@nocap/core/adapters", replacement: coreAdaptersSrc },
      { find: "@nocap/core", replacement: coreSrc },
      { find: "@nocap/mcp", replacement: mcpSrc },
      { find: "@web", replacement: fileURLToPath(new URL("./apps/web", import.meta.url)) },
    ],
  },
  test: {
    environment: "node",
    include: [
      "packages/*/test/**/*.test.ts",
      "apps/cli/test/**/*.test.ts",
      "apps/web/test/**/*.test.ts",
      "action/test/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/.cache/**", "**/e2e/**"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});