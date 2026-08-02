import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/cloud",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: {
    timeout: 90_000,
  },
  reporter: [["list"]],
  use: {
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
