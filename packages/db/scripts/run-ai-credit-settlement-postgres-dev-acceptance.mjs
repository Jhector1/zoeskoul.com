/** V12J.8A test-runner only: no billing business rules or app changes. */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { preflightBillingDevelopmentDatabase, selectedDevDatabaseUrl } from "./billing-postgres-dev-preflight.mjs";
const APPROVAL = "V12J8A_VERIFIED_DEVELOPMENT_DATABASE";
try {
  if (process.env.AI_SETTLEMENT_ACCEPTANCE_RUN !== APPROVAL)
    throw Error("AI_SETTLEMENT_EXPLICIT_APPROVAL_REQUIRED");
  // Reuse verified shared schema/identity preflight without adding dev-only
  // runtime rules. Scoped solely to this test process.
  process.env.BILLING_ACCEPTANCE_RUN = "V12J5_VERIFIED_DEVELOPMENT_DATABASE";
  const identity = await preflightBillingDevelopmentDatabase(selectedDevDatabaseUrl());
  console.log(`AI_SETTLEMENT_PREFLIGHT_PASS database=${identity.database} role=${identity.role} confirmed=YES writes=NO`);
  console.log("RUNNING V12J.8A REAL POSTGRES + SYNTHETIC AI PROVIDER/STRIPE EVIDENCE; test fixture writes=YES");
  const cwd = fileURLToPath(new URL("../../..", import.meta.url));
  const r = spawnSync("pnpm", ["--filter", "@zoeskoul/web", "exec", "vitest", "run",
    "src/lib/billing/aiCreditSettlementPostgres.acceptance.test.ts"], {
    cwd, env: process.env, stdio: "inherit", timeout: 180000,
  });
  if (r.error) throw r.error;
  process.exitCode = r.status ?? 1;
} catch (error) {
  console.error(`AI_SETTLEMENT_ACCEPTANCE_REFUSED reason=${error instanceof Error ? error.message : "UNKNOWN"}`);
  process.exitCode = 1;
}
