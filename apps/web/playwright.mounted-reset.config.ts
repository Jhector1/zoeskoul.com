import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd(), true);

export default defineConfig({
  testDir: "./tests/e2e/review",
  testMatch: "real-course-mounted-reset.spec.ts",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    actionTimeout: 20_000,
    baseURL: "http://localhost:3000",
    viewport: { width: 1440, height: 1000 },
    trace: "on",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } }],
});
