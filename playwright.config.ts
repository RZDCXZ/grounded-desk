import { defineConfig, devices } from "@playwright/test";

process.env.NO_PROXY = ["127.0.0.1", "localhost", process.env.NO_PROXY]
  .filter(Boolean)
  .join(",");

const requestAnalysisFixtures = Buffer.from(JSON.stringify({
  你好: {
    language: "zh",
    interactionType: "conversational",
    conversationalIntent: "greeting",
    factualRequests: [],
  },
  退款: {
    language: "zh",
    interactionType: "incomplete",
    conversationalIntent: null,
    factualRequests: [
      {
        originalText: "退款",
        normalizedQuestion: "退款",
        completeness: "incomplete",
        missingInformation: ["想了解退款的具体方面"],
      },
    ],
  },
})).toString("base64");

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
        `ALLOW_PRIVATE_WEB_SOURCES=true DETERMINISTIC_EMBEDDINGS=true DETERMINISTIC_AI=true DETERMINISTIC_REQUEST_ANALYSIS_FIXTURES_BASE64=${requestAnalysisFixtures} E2E_KNOWLEDGE_PROCESSING_DELAY_MS=500 node_modules/.bin/next dev`,
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
