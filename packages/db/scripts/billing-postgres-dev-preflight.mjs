/**
 * V12J.5A source-test-only acceptance guard. Reuses the V12I.4D PostgreSQL
 * identity/schema preflight. Does NOT change any application billing branch.
 */
import {
  preflightDevelopmentCreditAcceptance,
  selectedDevDatabaseUrl,
} from "./credit-postgres-dev-preflight.mjs";

export { selectedDevDatabaseUrl };

export async function preflightBillingDevelopmentDatabase(raw = selectedDevDatabaseUrl()) {
  if (process.env.BILLING_ACCEPTANCE_RUN !== "V12J5_VERIFIED_DEVELOPMENT_DATABASE") {
    throw Error("BILLING_ACCEPTANCE_EXPLICIT_APPROVAL_REQUIRED");
  }
  const db = process.env.BILLING_ACCEPTANCE_CONFIRMED_DATABASE;
  const role = process.env.BILLING_ACCEPTANCE_CONFIRMED_ROLE;
  if (!db || !role || db.length > 100 || role.length > 100 ||
      !/^[\w.\-]+$/.test(db) || !/^[\w.\-]+$/.test(role)) {
    throw Error("BILLING_ACCEPTANCE_DB_AND_ROLE_APPROVAL_REQUIRED");
  }
  // The shared preflight expects its own approval names. Set these ONLY inside
  // this dedicated test process; restore them even when PostgreSQL refuses.
  const names = [
    "CREDIT_ACCEPTANCE_RUN",
    "CREDIT_ACCEPTANCE_CONFIRMED_DATABASE",
    "CREDIT_ACCEPTANCE_CONFIRMED_ROLE",
  ];
  const old = names.map(name => process.env[name]);
  try {
    process.env.CREDIT_ACCEPTANCE_RUN = "V12I4_VERIFIED_DEVELOPMENT_DATABASE";
    process.env.CREDIT_ACCEPTANCE_CONFIRMED_DATABASE = db;
    process.env.CREDIT_ACCEPTANCE_CONFIRMED_ROLE = role;
    return await preflightDevelopmentCreditAcceptance(raw);
  } finally {
    names.forEach((name, i) => {
      if (old[i] === undefined) delete process.env[name];
      else process.env[name] = old[i];
    });
  }
}
