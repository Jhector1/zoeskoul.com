import { afterEach, describe, expect, it } from "vitest";
import { adminHostConfig, adminHostConfigForLab } from "./learningAdminSandbox.js";
import { isEligibleAdminLabLesson } from "./learningAdminLessonPolicy.js";
import { adminLabSwitchStatus, setAdminLabSwitch, assertAdminLabSwitch } from "./learningAdminSwitch.js";
const previous = process.env.ZOESKOUL_LEARNING_ADMIN_LAB_OUTBOUND_NETWORK;
const flag = process.env.ZOESKOUL_LEARNING_ADMIN_LABS_ENABLED;
afterEach(() => {
  setAdminLabSwitch(false);
  if (previous === undefined) delete process.env.ZOESKOUL_LEARNING_ADMIN_LAB_OUTBOUND_NETWORK;
  else process.env.ZOESKOUL_LEARNING_ADMIN_LAB_OUTBOUND_NETWORK = previous;
  if (flag === undefined) delete process.env.ZOESKOUL_LEARNING_ADMIN_LABS_ENABLED;
  else process.env.ZOESKOUL_LEARNING_ADMIN_LABS_ENABLED = flag;
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
  it("requires explicit network opt-in, never host networking", () => {
    process.env.ZOESKOUL_LEARNING_ADMIN_LAB_OUTBOUND_NETWORK = "true";
    expect(adminHostConfigForLab().NetworkMode).toBe("bridge");
    expect(adminHostConfigForLab().NetworkMode).not.toBe("host");
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
