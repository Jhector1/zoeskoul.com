/** V12J.5B dev-only runner. Real signed HMAC, PostgreSQL; simulated Stripe state/auth. */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { preflightBillingDevelopmentDatabase, selectedDevDatabaseUrl } from "./billing-postgres-dev-preflight.mjs";

try {
  if (process.env.BILLING_CROSSAPP_ACCEPTANCE_RUN !== "V12J5B_VERIFIED_DEVELOPMENT_DATABASE") {
    throw Error("BILLING_CROSSAPP_SECOND_EXPLICIT_APPROVAL_REQUIRED");
  }
  const identity = await preflightBillingDevelopmentDatabase(selectedDevDatabaseUrl());
  console.log(`BILLING_CROSSAPP_PREFLIGHT_PASS database=${identity.database} role=${identity.role} confirmed=YES writes=NO`);
  console.log("RUNNING V12J.5A + V12J.5B: SIGNED HMAC -> REAL DEV POSTGRES -> WEB + ZOEBUILD CONSUMERS; simulated Stripe, simulated authentication");
  const root = fileURLToPath(new URL("../../..", import.meta.url));
  const result = spawnSync("pnpm", ["--filter", "@zoeskoul/web", "exec", "vitest", "run",
    "src/lib/billing/billingWebhookPostgres.acceptance.test.ts"],
  { cwd: root, env: process.env, stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(`BILLING_CROSSAPP_ACCEPTANCE_REFUSED reason=${error instanceof Error ? error.message : "UNKNOWN"}`);
  process.exitCode = 1;
}
