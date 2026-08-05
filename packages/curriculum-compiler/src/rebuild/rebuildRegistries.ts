import { execSync } from "node:child_process";

export async function rebuildRegistries() {
  execSync(
    "pnpm --filter @zoeskoul/curriculum-registry generate:web",
    {
      stdio: "inherit",
    },
  );
}
