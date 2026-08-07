import path from "node:path";

import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";

const origin = "http://localhost:3000";
const authSecret =
  "zoeskoul-playwright-billing-auth-secret";
const storageStatePath =
  "/tmp/zoeskoul-billing-e2e-auth.json";
const userStatePath =
  "/tmp/zoeskoul-billing-e2e-user.json";

const forwardedWebhookSecret =
  process.env.E2E_STRIPE_WEBHOOK_SECRET ??
  process.env.STRIPE_WEBHOOK_SECRET ??
  null;

loadEnvConfig(
  process.cwd(),
  true,
  console,
  true,
);

if (!forwardedWebhookSecret?.startsWith("whsec_")) {
  throw new Error(
    "E2E_STRIPE_WEBHOOK_SECRET must come from `stripe listen`.",
  );
}

const stripeSecret =
  process.env.LEARNOIR_STRIPE_SECRET_KEY ?? "";
if (!stripeSecret.startsWith("sk_test_")) {
  throw new Error(
    "Billing acceptance is sandbox-only: LEARNOIR_STRIPE_SECRET_KEY must be sk_test_.",
  );
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required.");
}
if (!process.env.STRIPE_PRICE_MONTHLY_ID) {
  throw new Error("STRIPE_PRICE_MONTHLY_ID is required.");
}
if (!process.env.STRIPE_PRICE_YEARLY_ID) {
  throw new Error("STRIPE_PRICE_YEARLY_ID is required.");
}

Object.assign(process.env, {
  E2E_AUTH_SECRET: authSecret,
  AUTH_SECRET: authSecret,
  NEXTAUTH_SECRET: authSecret,
  AUTH_URL: origin,
  NEXTAUTH_URL: origin,
  AUTH_TRUST_HOST: "true",
  E2E_BILLING_ORIGIN: origin,
  E2E_BILLING_STORAGE_STATE: storageStatePath,
  E2E_BILLING_USER_STATE: userStatePath,
  STRIPE_WEBHOOK_SECRET: forwardedWebhookSecret,
  E2E_STRIPE_WEBHOOK_SECRET: forwardedWebhookSecret,
  KEYCLOAK_ISSUER:
    process.env.KEYCLOAK_ISSUER ??
    "http://127.0.0.1:9/realms/zoeskoul-e2e",
  KEYCLOAK_CLIENT_ID:
    process.env.KEYCLOAK_CLIENT_ID ?? "zoeskoul-e2e",
  KEYCLOAK_CLIENT_SECRET:
    process.env.KEYCLOAK_CLIENT_SECRET ?? "zoeskoul-e2e",
  ZOESKOUL_GOOGLE_CLIENT_ID:
    process.env.ZOESKOUL_GOOGLE_CLIENT_ID ?? "zoeskoul-e2e",
  ZOESKOUL_GOOGLE_CLIENT_SECRET:
    process.env.ZOESKOUL_GOOGLE_CLIENT_SECRET ?? "zoeskoul-e2e",
});

export default defineConfig({
  testDir: "./tests/e2e/billing",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 4 * 60 * 1000,
  expect: {
    timeout: 30_000,
  },
  globalSetup: path.resolve(
    process.cwd(),
    "tests/e2e/billing/global.setup.ts",
  ),
  globalTeardown: path.resolve(
    process.cwd(),
    "tests/e2e/billing/global.teardown.ts",
  ),
  use: {
    baseURL: origin,
    storageState: storageStatePath,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "billing-chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
  webServer: {
    command: "pnpm exec next dev --port 3000",
    url: origin,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      ...process.env,
      E2E_AUTH_SECRET: authSecret,
      AUTH_SECRET: authSecret,
      NEXTAUTH_SECRET: authSecret,
      AUTH_URL: origin,
      NEXTAUTH_URL: origin,
      AUTH_TRUST_HOST: "true",
      E2E_BILLING_ORIGIN: origin,
      E2E_BILLING_STORAGE_STATE: storageStatePath,
      E2E_BILLING_USER_STATE: userStatePath,
      STRIPE_WEBHOOK_SECRET: forwardedWebhookSecret,
      E2E_STRIPE_WEBHOOK_SECRET: forwardedWebhookSecret,
    },
  },
});
