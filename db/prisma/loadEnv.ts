import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

export function loadDbEnv() {
  const prismaDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(prismaDir, "../../..");

  for (const envPath of [
    path.join(repoRoot, "apps/web/.env.development.local"),
    path.join(repoRoot, "apps/web/.env.local"),
    path.join(repoRoot, "packages/.env.local"),
    path.join(repoRoot, ".env"),
  ]) {
    loadDotenv({ path: envPath, override: false, quiet: true });
  }
}
