import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "apps/web/src"),
        },
    },
    test: {
        environment: "node",
        include: [
            "packages/**/src/**/*.test.ts",
            "apps/web/src/**/*.test.ts",
        ],
        globals: true,
        restoreMocks: true,
        clearMocks: true,
        mockReset: true,
    },
});
