import path from "node:path";

import {
  defineConfig,
  devices,
} from "@playwright/test";

const websiteOrigin =
  process.env.E2E_WEBSITE_ORIGIN ??
  "http://localhost:3000";
const studentOrigin =
  process.env.E2E_STUDENT_ORIGIN ??
  "http://localhost:3002";

const authSecret =
  process.env.E2E_AUTH_SECRET ??
  "zoeskoul-playwright-student-runtime-auth-secret";
const practiceSecret =
  process.env.E2E_PRACTICE_KEY_SECRET ??
  "zoeskoul-playwright-student-runtime-practice-secret";
const guestSecret =
  process.env.E2E_GUEST_COOKIE_SECRET ??
  "zoeskoul-playwright-student-runtime-guest-secret";

const storageStatePath = path.join(
  process.cwd(),
  ".playwright",
  "student-runtime-auth.json",
);

process.env.E2E_AUTH_SECRET = authSecret;
process.env.AUTH_SECRET = authSecret;
process.env.NEXTAUTH_SECRET = authSecret;
process.env.PRACTICE_KEY_SECRET = practiceSecret;
process.env.GUEST_COOKIE_SECRET = guestSecret;
process.env.E2E_WEBSITE_ORIGIN = websiteOrigin;
process.env.E2E_STUDENT_ORIGIN = studentOrigin;
process.env.E2E_STUDENT_RUNTIME_STORAGE_STATE =
  storageStatePath;

export default defineConfig({
  testDir: "./tests/e2e/student-runtime",
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [
        ["html", { open: "never" }],
        ["github"],
      ]
    : [
        ["list"],
        ["html", { open: "never" }],
      ],
  globalSetup:
    "./tests/e2e/student-runtime/global.setup.ts",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: studentOrigin,
    storageState: storageStatePath,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm dev",
      url: websiteOrigin,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        NODE_ENV: "development",
        E2E_ALLOW_DEV_ROUTES: "1",
        E2E_AUTH_SECRET: authSecret,
        AUTH_SECRET: authSecret,
        NEXTAUTH_SECRET: authSecret,
        PRACTICE_KEY_SECRET: practiceSecret,
        GUEST_COOKIE_SECRET: guestSecret,
        UPSTASH_REDIS_REST_URL: "",
        UPSTASH_REDIS_REST_TOKEN: "",
        UPSTASH_REDIS_REST_READ_ONLY_TOKEN: "",
        RUNNER_SHARED_SECRET: "test-secret",
        RUNNER_BASE_URL: "http://127.0.0.1:4001",
        RUNNER_WS_BASE_URL: "ws://127.0.0.1:4001",
        KEYCLOAK_ISSUER:
          "http://127.0.0.1:65535/realms/e2e",
        KEYCLOAK_CLIENT_ID: "e2e",
        KEYCLOAK_CLIENT_SECRET: "e2e",
        ZOESKOUL_GOOGLE_CLIENT_ID: "e2e",
        ZOESKOUL_GOOGLE_CLIENT_SECRET: "e2e",
      },
    },
    {
      command:
        "pnpm --dir ../.. --filter @zoeskoul/student dev",
      url: studentOrigin,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        VITE_API_ORIGIN: websiteOrigin,
        VITE_WEBSITE_ORIGIN: websiteOrigin,
      },
    },
  ],
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
