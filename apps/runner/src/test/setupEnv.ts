// apps/runner/src/test/setupEnv.ts
process.env.RUNNER_SHARED_SECRET ||= "test-secret-test-secret-test-secret-32";
process.env.RUNNER_IMAGE ||= "zoeskoul-runtime:test";
process.env.RUNNER_WORKSPACE_ROOT ||= "/tmp/zoeskoul-runner-test-workspaces";
process.env.RUNNER_WORKSPACE_TTL_MS ||= "600000";
process.env.RUN_WALL_TIMEOUT_MS ||= "15000";
process.env.RUN_IDLE_TIMEOUT_MS ||= "20000";
process.env.PTY_IDLE_TIMEOUT_MS ||= "900000";
process.env.PTY_MAX_LIFETIME_MS ||= "7200000";
process.env.PTY_CLEANUP_INTERVAL_MS ||= "60000";
process.env.MAX_ACTIVE_SESSIONS_PER_USER ||= "4";
