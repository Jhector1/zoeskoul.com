/** User-invoked V12I.4D guarded runner. No schema changes or DB writes here. */
import { spawnSync } from "node:child_process";
import { selectedDevDatabaseUrl, preflightDevelopmentCreditAcceptance } from "./credit-postgres-dev-preflight.mjs";
try {
  const checked = await preflightDevelopmentCreditAcceptance(selectedDevDatabaseUrl());
  console.log(`CREDIT_DEV_PREFLIGHT_PASS database=${checked.database} role=${checked.role} confirmed=YES writes=NO`);
  console.log("RUNNING 8 EXISTING V12I.4 FINANCIAL ACCEPTANCE TESTS (fixture writes enabled)");
  const result = spawnSync("pnpm", ["--filter", "@zoeskoul/web", "exec", "vitest", "run", "src/lib/tutoring/creditPostgres.acceptance.test.ts"],
    { cwd: new URL("../../..", import.meta.url).pathname, env: process.env, stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status === null ? 1 : result.status;
} catch (error) {
  console.error(`CREDIT_DEV_ACCEPTANCE_REFUSED reason=${error instanceof Error ? error.message : "UNKNOWN"}`);
  process.exitCode = 1;
}
