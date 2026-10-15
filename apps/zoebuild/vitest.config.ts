import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const appRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(appRoot, "../..");

export default defineConfig({
  root: repoRoot,
  resolve: {
    alias: {
      "@": resolve(appRoot, "src"),
      "server-only": resolve(appRoot, "src/test/server-only.ts"),
    },
  },
  test: {
    include: [
      "apps/zoebuild/src/**/*.test.ts",
      "apps/zoebuild/src/**/*.test.tsx",
    ],
    environment: "node",
  },
});
