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

  it("does not infer administrator access from identity information", () => {
    expect(resolveTeachingRoleAccess({ roles: [] })).toMatchObject({
      allowed: false,
      isAdmin: false,
      isTeacher: false,
    });
  });

  it("rejects ordinary learners", () => {
    expect(resolveTeachingRoleAccess({ roles: ["student"] }).allowed).toBe(false);
  });
});
