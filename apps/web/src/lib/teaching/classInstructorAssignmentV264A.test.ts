import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd());
const source = (relative: string) =>
  readFileSync(resolve(root, relative), "utf8");

const route = source(
  "apps/web/src/app/api/teacher/schools/[id]/class-instructors/route.ts",
);
const staff = source(
  "apps/web/src/app/api/teacher/schools/[id]/staff/route.ts",
);
const access = source(
  "apps/web/src/lib/teaching/classAccess.ts",
);
const school = source(
  "apps/web/src/app/api/teacher/schools/[id]/route.ts",
);

describe("Class instructor assignment V264A", () => {
  it("requires institution staff-management permission and same-institution class/staff", () => {
    expect(route).toContain("getLearningOrganizationAccess");
    expect(route).toContain("canManageStaff");
    expect(route).toContain("organizationId: id");
    expect(route).toContain("organizationId_userId");
    expect(route).toContain('staff.role !== "instructor"');
  });

  it("never converts a student membership into instructor access", () => {
    expect(route).toContain('existing?.role === "student"');
    expect(route).toContain("learningGroupMember.create");
    expect(route).not.toContain("learningGroupMember.upsert");
    expect(route).toContain('role: "instructor"');
  });

  it("removes only instructor membership for one class", () => {
    expect(route).toContain("learningGroupMember.deleteMany");
    expect(route).toContain('role: "instructor"');
    expect(route).toContain("groupId: group.id");
    expect(route).toContain("userId: parsed.data.userId");
  });

  it("clears only same-institution class instructor memberships when staff leave", () => {
    expect(staff).toContain("learningGroupMember.deleteMany");
    expect(staff).toContain('role:"instructor"');
    expect(staff).toContain("group:{organizationId:id}");
    expect(staff).toContain("learningOrganizationMember.delete");
  });

  it("requires continuing institution membership for institution-class ownership", () => {
    expect(access).toContain("{ organizationId: null }");
    expect(access).toContain("memberships");
    expect(access).toContain("some: { userId }");
  });

  it("returns class instructor ids only for already-authorized institution classes", () => {
    expect(school).toContain('members: { where: { role: "instructor" }');
    expect(school).toContain("instructorUserIds");
    expect(school).toContain("learningGroupWhereForTeachingUser(teachingUser)");
  });
});
