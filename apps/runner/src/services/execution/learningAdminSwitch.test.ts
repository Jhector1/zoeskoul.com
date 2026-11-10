import { afterEach, describe, expect, it } from "vitest";
import { adminLabSwitchStatus, setAdminLabSwitch, assertAdminLabSwitch } from "./learningAdminSwitch.js";
import { isEligibleAdminLabLesson, ADMIN_LAB_TOPIC_SLUGS } from "./learningAdminLessonPolicy.js";

const previous = process.env.ZOESKOUL_LEARNING_ADMIN_LABS_ENABLED;
afterEach(() => {
  setAdminLabSwitch(false);
  if (previous === undefined) delete process.env.ZOESKOUL_LEARNING_ADMIN_LABS_ENABLED;
  else process.env.ZOESKOUL_LEARNING_ADMIN_LABS_ENABLED = previous;
});
describe("Learning administrator switch", () => {
  it("starts OFF and refuses root authorization until enabled", () => {
    setAdminLabSwitch(false);
    expect(adminLabSwitchStatus().enabled).toBe(false);
    expect(() => assertAdminLabSwitch()).toThrow(/disabled/);
  });
  it("cannot enable when deployment flag is OFF", () => {
    process.env.ZOESKOUL_LEARNING_ADMIN_LABS_ENABLED = "false";
    expect(() => setAdminLabSwitch(true)).toThrow(/disabled/);
    expect(adminLabSwitchStatus().enabled).toBe(false);
  });
  it("invalidate in-flight launches on OFF or a re-enabled generation", () => {
    process.env.ZOESKOUL_LEARNING_ADMIN_LABS_ENABLED = "true";
    const state = setAdminLabSwitch(true);
    expect(assertAdminLabSwitch(state.generation)).toBe(state.generation);
    setAdminLabSwitch(false);
    expect(() => assertAdminLabSwitch(state.generation)).toThrow();
    setAdminLabSwitch(true);
    expect(() => assertAdminLabSwitch(state.generation)).toThrow();
  });
  it("only restricts the three planned Course 2 admin topics", () => {
    expect(ADMIN_LAB_TOPIC_SLUGS).toHaveLength(3);
    for (const topic of ADMIN_LAB_TOPIC_SLUGS) {
      expect(isEligibleAdminLabLesson("linux-files-permissions-users", topic)).toBe(true);
    }
    expect(isEligibleAdminLabLesson("linux-terminal-fundamentals", "sudo-root-concepts")).toBe(false);
    expect(isEligibleAdminLabLesson("linux-files-permissions-users", "current-user-and-groups")).toBe(false);
    expect(isEligibleAdminLabLesson("linux-files-permissions-users", "__proto__")).toBe(false);
  });
});
