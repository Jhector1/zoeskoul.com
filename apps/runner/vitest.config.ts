// apps/runner/vitest.config.ts
export default {
    test: {
        environment: "node",
        include: ["src/**/*.test.ts"],
        exclude: ["node_modules/**", "dist/**"],
        globals: false,
        pool: "forks",
        setupFiles: ["./src/test/setupEnv.ts"],
        env: {
            RUNNER_SHARED_SECRET: "test-secret",
            RUNNER_IMAGE: "zoeskoul-runtime:test",
            RUNNER_WORKSPACE_ROOT: "/tmp/zoeskoul-runner-test-workspaces",
            RUNNER_WORKSPACE_TTL_MS: "600000",
        },
    },
};