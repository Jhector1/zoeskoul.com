import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd());
const source = (relative: string) =>
  readFileSync(resolve(root, relative), "utf8");

const access = source("apps/web/src/lib/teaching/classAccess.ts");
const collection = source("apps/web/src/app/api/teacher/learning-groups/route.ts");
const detail = source("apps/web/src/app/api/teacher/learning-groups/[id]/route.ts");
const dashboard = source("apps/web/src/app/api/teacher/learning-groups/[id]/dashboard/route.ts");
const announcements = source("apps/web/src/app/api/teacher/learning-groups/[id]/announcements/route.ts");
const invites = source("apps/web/src/app/api/teacher/learning-groups/[id]/invites/route.ts");
const status = source("apps/web/src/app/api/teacher/learning-groups/[id]/status/route.ts");
const school = source("apps/web/src/app/api/teacher/schools/[id]/route.ts");
const organizationInvites = source("apps/web/src/lib/learningOrganizations/organizationInvites.ts");

describe("Institution and class isolation V263A", () => {
  it("models institution admin, owner, class owner, and explicit instructor access", () => {
    expect(access).toContain("ownerId: userId");
    expect(access).toContain("organizationAdminRole");
    expect(access).toContain("groupInstructorRole");
    expect(access).toContain("memberships");
    expect(access).toContain("members");
    expect(access).toContain("organizationId: null");
    expect(access).not.toContain('role: "student"');
  });

  it("uses one canonical class boundary across class list and nested class APIs", () => {
    for (const route of [collection, detail, dashboard, announcements, invites, status]) {
      expect(route).toContain("learningGroupWhereForTeachingUser");
      expect(route).not.toContain("ownedTeachingRecordWhere");
    }
  });

  it("does not expose unrelated class names through institution detail", () => {
    expect(school).toContain(
      "groups: { where: learningGroupWhereForTeachingUser(teachingUser)",
    );
    expect(school).toContain("groups: school.groups.length");
  });

  it("keeps institution invite acceptance institution-scoped", () => {
    expect(organizationInvites).toContain("learningOrganizationMember.upsert");
    expect(organizationInvites).not.toContain("learningGroupMember.upsert");
    expect(organizationInvites).not.toContain("learningAssignmentUser.upsert");
    expect(organizationInvites).not.toContain("tutoringSessionUser.upsert");
  });
});
