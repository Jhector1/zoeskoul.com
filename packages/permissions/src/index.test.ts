import {
  describe,
  expect,
  it,
} from "vitest";

import {
  APP_CAPABILITIES,
  normalizeAppRoles,
  resolveAppCapabilities,
  resolveRoleCapabilities,
} from "./index";

describe("permission contracts", () => {
  it("normalizes the student role", () => {
    expect(
      normalizeAppRoles(["student"]),
    ).toEqual(["student"]);
    expect(
      resolveAppCapabilities(["student"]),
    ).toEqual(["student:access"]);
  });

  it("keeps learner compatibility as student access", () => {
    expect(
      normalizeAppRoles(["learner"]),
    ).toEqual(["student"]);
    expect(
      resolveAppCapabilities([
        "learner",
      ]),
    ).toEqual(["student:access"]);
  });

  it("preserves teacher inheritance into student access", () => {
    expect(
      resolveAppCapabilities(["teacher"]),
    ).toEqual([
      "student:access",
      "teacher:access",
    ]);
  });

  it("preserves admin inheritance into teacher and student access", () => {
    expect(
      resolveAppCapabilities(["admin"]),
    ).toEqual([
      "student:access",
      "teacher:access",
      "admin:access",
    ]);
  });

  it("deduplicates multiple and duplicate roles", () => {
    expect(
      normalizeAppRoles([
        "teacher",
        "student",
        "teacher",
        "TEACHER",
      ]),
    ).toEqual([
      "teacher",
      "student",
    ]);
    expect(
      resolveAppCapabilities([
        "teacher",
        "student",
        "teacher",
      ]),
    ).toEqual([
      "student:access",
      "teacher:access",
    ]);
  });

  it("ignores unknown runtime roles", () => {
    expect(
      normalizeAppRoles([
        "student",
        "unknown",
      ]),
    ).toEqual(["student"]);
    expect(
      resolveAppCapabilities([
        "unknown",
      ]),
    ).toEqual([]);
  });

  it("returns stable capability ordering", () => {
    expect(
      resolveAppCapabilities([
        "admin",
        "teacher",
        "student",
      ]),
    ).toEqual(APP_CAPABILITIES);
  });

  it("keeps the existing privileged server helpers compatible", () => {
    expect(
      resolveRoleCapabilities(["teacher"]),
    ).toMatchObject({
      accessStudentApp: true,
      accessTeacherApp: true,
      accessAdminApp: false,
      canUnlockAll: true,
      canBypassBilling: true,
    });
  });
});
