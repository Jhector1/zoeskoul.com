import {
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";

const cwd = process.cwd();
const root = cwd.endsWith("/apps/web")
  ? resolve(cwd, "../..")
  : cwd;

function source(relative: string) {
  return readFileSync(
    resolve(root, relative),
    "utf8",
  );
}

describe("School course access architecture", () => {
  const schema = source(
    "packages/db/prisma/schema.prisma",
  );
  const assignment = source(
    "apps/web/src/lib/learningAssignments/assignmentAdminServer.ts",
  );
  const catalog = source(
    "apps/web/src/lib/learningAssignments/assignableCourses.ts",
  );
  const school = source(
    "apps/web/src/lib/learningOrganizations/organizationCourseAccess.ts",
  );
  const route = source(
    "apps/web/src/app/api/teacher/schools/[id]/courses/route.ts",
  );

  it("adds only a School-to-canonical-course bridge", () => {
    expect(schema).toContain(
      "model LearningOrganizationCourseAccess {",
    );
    expect(schema).toContain(
      "organization   LearningOrganization",
    );
    expect(schema).toContain(
      "subject        PracticeSubject",
    );

    for (const model of [
      "SchoolCourse",
      "ClassCourse",
      "SchoolProgress",
      "SchoolGradebook",
    ]) {
      expect(schema).not.toContain(
        `model ${model} {`,
      );
    }
  });

  it("shares one assignable-course owner", () => {
    expect(catalog).toContain(
      'status: "active"',
    );
    expect(catalog).toContain(
      'visibility: "private"',
    );
    expect(school).toContain(
      "listRawAssignableCourses",
    );
  });

  it("requires School course access for School class assignments", () => {
    expect(assignment).toContain(
      "learningOrganizationCourseAccess.findMany",
    );
    expect(assignment).toContain(
      "organizationId",
    );
    expect(assignment).toContain(
      "ownedTeachingRecordWhere",
    );
  });

  it("uses existing School authorization", () => {
    expect(route).toContain(
      "getLearningOrganizationAccess",
    );
    expect(route).toContain(
      "canAccessSchool",
    );
    expect(route).toContain(
      "canManageSchool",
    );
    expect(route).toContain(
      "isAppMutationOriginAllowed",
    );
  });

  it("does not delete a course bridge while assignments still use it", () => {
    expect(school).toContain(
      "learningAssignmentGroup.count",
    );
    expect(school).toContain(
      "course_in_use",
    );
  });
});
