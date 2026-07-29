import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vitest/config";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    resolve: {
        alias: {
            "@": resolve(rootDir, "src"),
            "@zoeskoul-code-input-expected": resolve(
                rootDir,
                "../../packages/curriculum-profiles/src/base/codeInputExpected.ts",
            ),
            "server-only": resolve(rootDir, "src/test/serverOnly.ts"),
        },
    },
    test: {
        environment: "node",
        include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
        exclude: ["node_modules", ".next", "tests/e2e/**"],
    },
});