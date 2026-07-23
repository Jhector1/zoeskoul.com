import { describe, expect, it } from "vitest";
import { resolveTeachingRoleAccess } from "./teachingRoleAccess";

describe("resolveTeachingRoleAccess", () => {
  it("allows teachers to manage private course delivery", () => {
    expect(resolveTeachingRoleAccess({ roles: ["teacher"] })).toMatchObject({
      allowed: true,
      isTeacher: true,
      isAdmin: false,
    });
  });

  it("allows admins the same delivery capabilities", () => {
    expect(resolveTeachingRoleAccess({ roles: ["ADMIN"] })).toMatchObject({
      allowed: true,
      isTeacher: false,
      isAdmin: true,
      roles: ["admin"],
    });
  });

  it("supports configured admin emails", () => {
    expect(
      resolveTeachingRoleAccess({
        roles: [],
        email: "ADMIN@example.com",
        configuredAdminEmails: ["admin@example.com"],
      }),
    ).toMatchObject({ allowed: true, isAdmin: true });
  });

  it("rejects ordinary learners", () => {
    expect(resolveTeachingRoleAccess({ roles: ["student"] }).allowed).toBe(false);
  });
});
