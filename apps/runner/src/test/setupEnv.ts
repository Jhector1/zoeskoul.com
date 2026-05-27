// apps/runner/src/test/setupEnv.ts
process.env.RUNNER_SHARED_SECRET ||= "test-secret";
process.env.RUNNER_IMAGE ||= "zoeskoul-runtime:test";
process.env.RUNNER_WORKSPACE_ROOT ||= "/tmp/zoeskoul-runner-test-workspaces";
process.env.RUNNER_WORKSPACE_TTL_MS ||= "600000";
process.env.RUN_WALL_TIMEOUT_MS ||= "15000";
process.env.RUN_IDLE_TIMEOUT_MS ||= "20000";