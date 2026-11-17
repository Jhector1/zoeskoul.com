import { afterEach, describe, expect, it } from "vitest";
import { adminHostConfig, adminHostConfigForLab, adminLabNetworkMode, adminLabSessionIsolationEnabled } from "./learningAdminSandbox.js";
import { isEligibleAdminLabLesson } from "./learningAdminLessonPolicy.js";
import { adminLabSwitchStatus, setAdminLabSwitch, assertAdminLabSwitch } from "./learningAdminSwitch.js";
const previous = process.env.ZOESKOUL_LEARNING_ADMIN_LAB_OUTBOUND_NETWORK;
const flag = process.env.ZOESKOUL_LEARNING_ADMIN_LABS_ENABLED;
const previousMode = process.env.ZOESKOUL_LEARNING_ADMIN_LAB_DEPLOYMENT_MODE;
const previousAck = process.env.ZOESKOUL_LEARNING_ADMIN_LAB_DEV_BRIDGE_ACK;
const previousNetworkPolicy = process.env.ZOESKOUL_LEARNING_ADMIN_LAB_NETWORK_POLICY;
afterEach(() => {
  setAdminLabSwitch(false);
  if (previous === undefined) delete process.env.ZOESKOUL_LEARNING_ADMIN_LAB_OUTBOUND_NETWORK;
  else process.env.ZOESKOUL_LEARNING_ADMIN_LAB_OUTBOUND_NETWORK = previous;
  if (flag === undefined) delete process.env.ZOESKOUL_LEARNING_ADMIN_LABS_ENABLED;
  else process.env.ZOESKOUL_LEARNING_ADMIN_LABS_ENABLED = flag;
  if (previousMode === undefined) delete process.env.ZOESKOUL_LEARNING_ADMIN_LAB_DEPLOYMENT_MODE;
  else process.env.ZOESKOUL_LEARNING_ADMIN_LAB_DEPLOYMENT_MODE = previousMode;
  if (previousAck === undefined) delete process.env.ZOESKOUL_LEARNING_ADMIN_LAB_DEV_BRIDGE_ACK;
  else process.env.ZOESKOUL_LEARNING_ADMIN_LAB_DEV_BRIDGE_ACK = previousAck;
  if (previousNetworkPolicy === undefined) delete process.env.ZOESKOUL_LEARNING_ADMIN_LAB_NETWORK_POLICY;
  else process.env.ZOESKOUL_LEARNING_ADMIN_LAB_NETWORK_POLICY = previousNetworkPolicy;
});
describe("full privileges stays inside a disposable rootless lab", () => {
  it("preserves no-network and no-host-bind defaults", () => {
    delete process.env.ZOESKOUL_LEARNING_ADMIN_LAB_OUTBOUND_NETWORK;
    expect(adminHostConfigForLab().NetworkMode).toBe("none");
    expect(adminHostConfig.NetworkMode).toBe("none");
    expect(adminHostConfigForLab()).not.toHaveProperty("Binds");
    expect(adminHostConfigForLab()).not.toHaveProperty("Privileged");
    expect(adminHostConfigForLab().CapDrop).toContain("ALL");
  });
  it("defaults to no network, including a production mode", () => {
    delete process.env.ZOESKOUL_LEARNING_ADMIN_LAB_OUTBOUND_NETWORK;
    delete process.env.ZOESKOUL_LEARNING_ADMIN_LAB_DEPLOYMENT_MODE;
    expect(adminHostConfigForLab().NetworkMode).toBe("none");
    expect(adminLabNetworkMode({ ZOESKOUL_LEARNING_ADMIN_LAB_DEPLOYMENT_MODE: "production" })).toBe("none");
  });
  it("fails closed when bridge is requested without a dedicated development acknowledgement", () => {
    const flags = { ZOESKOUL_LEARNING_ADMIN_LAB_OUTBOUND_NETWORK: "true" };
    expect(() => adminLabNetworkMode(flags)).toThrow(/forbidden/);
    expect(() => adminLabNetworkMode({ ...flags, ZOESKOUL_LEARNING_ADMIN_LAB_DEPLOYMENT_MODE: "production", ZOESKOUL_LEARNING_ADMIN_LAB_DEV_BRIDGE_ACK: "UNFILTERED_DEV_BRIDGE_ONLY" })).toThrow(/forbidden/);
    expect(() => adminLabNetworkMode({ ...flags, ZOESKOUL_LEARNING_ADMIN_LAB_DEPLOYMENT_MODE: "development" })).toThrow(/forbidden/);
  });
  it("allows supervised development egress only with both explicit flags", () => {
    const allowed = {
      ZOESKOUL_LEARNING_ADMIN_LAB_OUTBOUND_NETWORK: "true",
      ZOESKOUL_LEARNING_ADMIN_LAB_DEPLOYMENT_MODE: "development",
      ZOESKOUL_LEARNING_ADMIN_LAB_DEV_BRIDGE_ACK: "UNFILTERED_DEV_BRIDGE_ONLY",
    };
    expect(adminLabNetworkMode(allowed)).toBe("bridge");
    expect(adminLabNetworkMode({ ...allowed, ZOESKOUL_LEARNING_ADMIN_LAB_OUTBOUND_NETWORK: "false" })).toBe("none");
    expect(() => adminLabNetworkMode({ ...allowed, ZOESKOUL_LEARNING_ADMIN_LAB_OUTBOUND_NETWORK: "TRUE" })).toThrow(/Invalid/);
    expect(() => adminLabNetworkMode({ ...allowed, ZOESKOUL_LEARNING_ADMIN_LAB_DEPLOYMENT_MODE: "prod" })).toThrow(/Invalid/);
    process.env.ZOESKOUL_LEARNING_ADMIN_LAB_OUTBOUND_NETWORK = "true";
    process.env.ZOESKOUL_LEARNING_ADMIN_LAB_DEPLOYMENT_MODE = "development";
    process.env.ZOESKOUL_LEARNING_ADMIN_LAB_DEV_BRIDGE_ACK = "UNFILTERED_DEV_BRIDGE_ONLY";
    const hostConfig = adminHostConfigForLab();
    expect(hostConfig.NetworkMode).toBe("bridge");
    expect(hostConfig).not.toHaveProperty("Binds");
    expect(hostConfig).not.toHaveProperty("Privileged");
    expect(hostConfig.CapDrop).toContain("ALL");
  });
  it("defaults to existing offline or supervised development behavior", () => {
    expect(adminLabSessionIsolationEnabled({})).toBe(false);
    expect(adminLabSessionIsolationEnabled({ ZOESKOUL_LEARNING_ADMIN_LAB_NETWORK_POLICY: "none" })).toBe(false);
    expect(() => adminLabSessionIsolationEnabled({ ZOESKOUL_LEARNING_ADMIN_LAB_NETWORK_POLICY: "unfiltered" })).toThrow(/Unknown/);
  });
  it("requires offline-only mode for per-session isolation", () => {
    const isolated = { ZOESKOUL_LEARNING_ADMIN_LAB_NETWORK_POLICY: "per-session-internal", ZOESKOUL_LEARNING_ADMIN_LAB_OUTBOUND_NETWORK: "false" };
    expect(adminLabSessionIsolationEnabled(isolated)).toBe(true);
    expect(() => adminLabSessionIsolationEnabled({ ...isolated, ZOESKOUL_LEARNING_ADMIN_LAB_OUTBOUND_NETWORK: "true" })).toThrow(/cannot/);
    process.env.ZOESKOUL_LEARNING_ADMIN_LAB_NETWORK_POLICY = "per-session-internal";
    process.env.ZOESKOUL_LEARNING_ADMIN_LAB_OUTBOUND_NETWORK = "false";
    expect(adminHostConfigForLab().NetworkMode).toBe("none"); // Overridden only with verified per-session identity at Docker create.
  });
  it("only enables the special scope with the existing signed grant and operator switch", () => {
    expect(isEligibleAdminLabLesson("linux-files-permissions-users", "full-privileges")).toBe(true);
    expect(isEligibleAdminLabLesson("zoebuild", "full-privileges")).toBe(false);
    expect(isEligibleAdminLabLesson("linux-files-permissions-users", "arbitrary-root")).toBe(false);
    process.env.ZOESKOUL_LEARNING_ADMIN_LABS_ENABLED = "true";
    setAdminLabSwitch(false);
    expect(() => assertAdminLabSwitch()).toThrow();
    setAdminLabSwitch(true);
    const state = adminLabSwitchStatus();
    expect(assertAdminLabSwitch(state.generation)).toBe(state.generation);
    setAdminLabSwitch(false);
    expect(() => assertAdminLabSwitch(state.generation)).toThrow();
  });
});
