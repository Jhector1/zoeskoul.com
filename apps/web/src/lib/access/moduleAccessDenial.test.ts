import { describe, expect, it } from "vitest";
import { describeModuleAccessDenial } from "./moduleAccessDenial";

describe("describeModuleAccessDenial", () => {
  it("keeps private-course assignment denial out of billing", () => {
    expect(
      describeModuleAccessDenial({
        ok: false,
        paid: false,
        reason: "requires_assignment",
      }),
    ).toMatchObject({
      kind: "assignment",
      status: 403,
      code: "COURSE_ASSIGNMENT_REQUIRED",
    });
  });

  it("distinguishes private sign-in from paid sign-in", () => {
    expect(
      describeModuleAccessDenial({
        ok: false,
        paid: false,
        reason: "requires_login",
      }).kind,
    ).toBe("auth");

    expect(
      describeModuleAccessDenial({
        ok: false,
        paid: true,
        reason: "requires_login",
      }).kind,
    ).toBe("billing");
  });
});
