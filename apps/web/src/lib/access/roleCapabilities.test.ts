import { describe, expect, it } from "vitest";

import { resolveRoleCapabilities } from "./roleCapabilities";

describe("resolveRoleCapabilities", () => {
  it("gives admins full learning access without requiring payment", () => {
    expect(resolveRoleCapabilities(["ADMIN"])).toMatchObject({
      isAdmin: true,
      canUnlockAll: true,
      canBypassBilling: true,
      canUseUnlimitedPractice: true,
    });
  });

  it("preserves the existing teacher payment exemption", () => {
    expect(resolveRoleCapabilities(["teacher"])).toMatchObject({
      isTeacher: true,
      canUnlockAll: true,
      canBypassBilling: true,
      canUseUnlimitedPractice: true,
    });
  });

  it("does not grant privileged capabilities to learners", () => {
    expect(resolveRoleCapabilities(["learner"])).toMatchObject({
      canUnlockAll: false,
      canBypassBilling: false,
      canUseUnlimitedPractice: false,
    });
  });
});
