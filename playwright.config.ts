import { defineConfig, devices } from "@playwright/test";

process.env.NO_PROXY = ["127.0.0.1", "localhost", process.env.NO_PROXY]
  .filter(Boolean)
  .join(",");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node tests/fixtures/web-knowledge-source-server.ts",
      url: "http://127.0.0.1:4173/health",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command:
        "ALLOW_PRIVATE_WEB_SOURCES=true DETERMINISTIC_EMBEDDINGS=true E2E_KNOWLEDGE_PROCESSING_DELAY_MS=500 node_modules/.bin/next dev",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
