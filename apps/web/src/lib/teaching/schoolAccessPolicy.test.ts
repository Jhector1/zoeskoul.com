
import { describe, expect, it } from "vitest";

import {
  resolveLearningOrganizationAccessPolicy,
} from "./schoolAccessPolicy";

describe("resolveLearningOrganizationAccessPolicy", () => {
  it("allows the school owner to manage the school", () => {
    expect(
      resolveLearningOrganizationAccessPolicy({
        platformAdmin: false,
        owner: true,
        membershipRole: null,
      }),
    ).toEqual({
      canAccessSchool: true,
      canManageSchool: true,
      canManageStaff: true,
      canCreateClasses: true,
      canTeach: true,
    });
  });

  it("allows scoped school admins without making them platform admins", () => {
    expect(
      resolveLearningOrganizationAccessPolicy({
        platformAdmin: false,
        owner: false,
        membershipRole: "admin",
      }),
    ).toMatchObject({
      canAccessSchool: true,
      canManageSchool: true,
      canManageStaff: true,
    });
  });

  it("allows instructors to teach but not manage school staff", () => {
    expect(
      resolveLearningOrganizationAccessPolicy({
        platformAdmin: false,
        owner: false,
        membershipRole: "instructor",
      }),
    ).toEqual({
      canAccessSchool: true,
      canManageSchool: false,
      canManageStaff: false,
      canCreateClasses: true,
      canTeach: true,
    });
  });

  it("allows platform admins to support every school", () => {
    expect(
      resolveLearningOrganizationAccessPolicy({
        platformAdmin: true,
        owner: false,
        membershipRole: null,
      }).canManageSchool,
    ).toBe(true);
  });

  it("denies an unrelated teacher", () => {
    expect(
      resolveLearningOrganizationAccessPolicy({
        platformAdmin: false,
        owner: false,
        membershipRole: null,
      }).canAccessSchool,
    ).toBe(false);
  });
});
