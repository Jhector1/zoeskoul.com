import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";

export default async function globalTeardown() {
  try {
    execFileSync(
      "pnpm",
      [
        "exec",
        "tsx",
        "tests/e2e/billing/cleanup-user.ts",
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: "inherit",
      },
    );
  } finally {
    for (const candidate of [
      process.env.E2E_BILLING_STORAGE_STATE,
      process.env.E2E_BILLING_USER_STATE,
    ]) {
      if (!candidate) continue;
      await fs.rm(candidate, { force: true }).catch(() => undefined);
    }
  }
}
