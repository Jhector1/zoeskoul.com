import assert from "node:assert/strict";
import { test } from "vitest";
import { resolveAdminSessionTimeoutPolicy } from "./adminSessionTimeoutPolicy.js";
const protectedDev = {
  RUNNER_EXECUTION_POOL: "zoeskoul-learning",
  ZOESKOUL_LEARNING_ADMIN_LABS_ENABLED: "true",
  ZOESKOUL_LEARNING_ADMIN_LAB_DEPLOYMENT_MODE: "development",
  ZOESKOUL_LEARNING_ADMIN_LAB_NETWORK_POLICY: "per-session-controlled-egress",
  ZOESKOUL_LEARNING_ADMIN_LAB_OUTBOUND_NETWORK: "false",
  ZOESKOUL_LEARNING_ADMIN_EGRESS_DEV_ACK: "PROTECTED_LIFECYCLE_TEST_ONLY",
  ZOESKOUL_LEARNING_ADMIN_EGRESS_PROXY_IMAGE: `sha256:${"a".repeat(64)}`,
  ZOESKOUL_LEARNING_ADMIN_EGRESS_FIREWALL_IMAGE: `sha256:${"b".repeat(64)}`,
};
const short = { idleTimeoutMs: 300_000, hardLifetimeMs: 600_000, wallTimeoutMs: null };
const extended = { idleTimeoutMs: 1_800_000, hardLifetimeMs: 7_200_000, wallTimeoutMs: null };
test("protected global Full Privileges allows tutoring-length sessions", () => {
  assert.deepEqual(resolveAdminSessionTimeoutPolicy("full-privileges", protectedDev), extended);
});
test("graded lessons and unknown targets keep the original limits", () => {
  for (const topic of [undefined, "sudo-root-concepts", "ownership-administration-concepts", "final-capstone-secure-project", "unknown"])
    assert.deepEqual(resolveAdminSessionTimeoutPolicy(topic, protectedDev), short);
});
test("every protected eligibility condition is required", () => {
  for (const key of Object.keys(protectedDev)) {
    const configuration: NodeJS.ProcessEnv = {...protectedDev};
    delete configuration[key];
    assert.deepEqual(resolveAdminSessionTimeoutPolicy("full-privileges", configuration), short, key);
  }
});
test("production, other pools and unrestricted networking keep short limits", () => {
  for (const configuration of [{}, {...protectedDev, ZOESKOUL_LEARNING_ADMIN_LAB_DEPLOYMENT_MODE: "production"}, {...protectedDev,RUNNER_EXECUTION_POOL:"zoebuild"}, {...protectedDev,ZOESKOUL_LEARNING_ADMIN_LAB_OUTBOUND_NETWORK:"true"}])
    assert.deepEqual(resolveAdminSessionTimeoutPolicy("full-privileges", configuration), short);
});
test("policy cannot be extended by arbitrary request-like configuration values", () => {
  assert.deepEqual(resolveAdminSessionTimeoutPolicy("full-privileges", {...protectedDev, idleTimeoutMs:"999999999", hardLifetimeMs:"999999999"}),extended);
});
