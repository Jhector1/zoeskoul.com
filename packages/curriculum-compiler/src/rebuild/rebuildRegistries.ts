import { execSync } from "node:child_process";

export async function rebuildRegistries() {
  execSync("pnpm --filter @zoeskoul/web i18n:generate", {
    stdio: "inherit",
  });

  execSync("pnpm --filter @zoeskoul/web gen:topic-manifests", {
    stdio: "inherit",
  });

  execSync("pnpm --filter @zoeskoul/web gen:subject-manifests", {
    stdio: "inherit",
  });
}