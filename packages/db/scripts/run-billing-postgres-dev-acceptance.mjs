/** Real signed HMAC; simulated provider state; real confirmed DEVELOPMENT DB. */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { preflightBillingDevelopmentDatabase, selectedDevDatabaseUrl } from "./billing-postgres-dev-preflight.mjs";

try {
  const identity = await preflightBillingDevelopmentDatabase(selectedDevDatabaseUrl());
  console.log(`BILLING_DEV_PREFLIGHT_PASS database=${identity.database} role=${identity.role} confirmed=YES writes=NO`);
  console.log("RUNNING V12J.5A SIGNED HMAC + REAL POSTGRES BILLING ACCEPTANCE (synthetic fixture writes; NO Stripe API calls)");
  const cwd = fileURLToPath(new URL("../../..", import.meta.url));
  const r = spawnSync("pnpm", ["--filter", "@zoeskoul/web", "exec", "vitest", "run",
    "src/lib/billing/billingWebhookPostgres.acceptance.test.ts"],
    { cwd, env: process.env, stdio: "inherit" });
  if (r.error) throw r.error;
  process.exitCode = r.status ?? 1;
} catch (error) {
  console.error(`BILLING_DEV_ACCEPTANCE_REFUSED reason=${error instanceof Error ? error.message : "UNKNOWN"}`);
  process.exitCode = 1;
}
