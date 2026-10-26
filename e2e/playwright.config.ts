import { defineConfig } from "@playwright/test";

const PORT = 3123;

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `sh -c "pnpm -C ../apps/web build && pnpm -C ../apps/web exec next start -p ${PORT}"`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { MOCK_EXTERNALS: "true" },
  },
});
