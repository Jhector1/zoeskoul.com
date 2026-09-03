
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd());

function source(relative: string) {
  return readFileSync(resolve(root, relative), "utf8");
}

describe("School Mode architecture ownership", () => {
  const schema = source("packages/db/prisma/schema.prisma");

  it("uses LearningOrganization only as the new school boundary", () => {
    expect(schema).toContain("model LearningOrganization {");
    expect(schema).toContain("model LearningOrganizationMember {");
    expect(schema).toContain("organizationId String?");
  });

  it("keeps LearningGroup as the canonical class/cohort owner", () => {
    expect(schema).toContain("model LearningGroup {");
    expect(schema).toContain("enum LearningGroupMemberRole");
    expect(schema).not.toContain("model SchoolClass {");
    expect(schema).not.toContain("model Classroom {");
  });

  it("reuses the existing assignment-to-group bridge", () => {
    expect(schema).toContain("model LearningAssignmentGroup {");
    expect(schema).toContain("assignmentId String");
    expect(schema).toContain("groupId      String");
  });

  it("does not create a school-specific learner progress store", () => {
    expect(schema).toContain("model ReviewProgress {");
    expect(schema).toContain("model SubjectEnrollment {");
    expect(schema).toContain("model LearnerProgress {");
    expect(schema).not.toContain("model SchoolProgress {");
    expect(schema).not.toContain("model ClassProgress {");
  });

  it("keeps School APIs under the existing Teacher API namespace", () => {
    const route = source(
      "apps/web/src/app/api/teacher/schools/route.ts",
    );

    expect(route).toContain("getTeachingUser");
    expect(route).toContain("learningOrganizationWhereForTeachingUser");
    expect(route).toContain("isAppMutationOriginAllowed");
  });
});
