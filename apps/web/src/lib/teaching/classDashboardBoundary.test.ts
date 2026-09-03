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

const root = resolve(process.cwd());

function source(relativePath: string) {
  return readFileSync(
    resolve(root, relativePath),
    "utf8",
  );
}

describe("Teacher class dashboard architecture", () => {
  const schema = source(
    "packages/db/prisma/schema.prisma",
  );
  const query = source(
    "apps/web/src/lib/learningGroups/classDashboard.ts",
  );
  const route = source(
    "apps/web/src/app/api/teacher/learning-groups/[id]/dashboard/route.ts",
  );
  const teacher = source(
    "apps/teacher/src/features/classes/TeacherClassDashboard.tsx",
  );

  it("does not create a parallel gradebook or class progress store", () => {
    expect(schema).not.toContain("model Gradebook");
    expect(schema).not.toContain("model ClassProgress");
    expect(schema).not.toContain("model SchoolProgress");
  });

  it("projects only from canonical class, assignment, and learner progress owners", () => {
    expect(query).toContain("learningGroup.findUnique");
    expect(query).toContain("learnerProgress.findMany");
    expect(query).toContain("subjectEnrollment.findMany");
    expect(query).toContain("reviewProgress.findMany");
    expect(query).toContain("practiceAttempt.findMany");
    expect(query).not.toContain(".create(");
    expect(query).not.toContain(".update(");
    expect(query).not.toContain(".upsert(");
  });

  it("keeps class authorization and CORS on the existing Teacher API boundary", () => {
    expect(route).toContain("getTeachingUser");
    expect(route).toContain("ownedTeachingRecordWhere");
    expect(route).toContain("isAppOriginAllowed");
    expect(route).toContain("appCorsJson");
    expect(route).toContain("appCorsPreflight");
  });

  it("keeps browser UI in Teacher and Prisma out of Teacher", () => {
    expect(teacher).toContain("useTranslations");
    expect(teacher).toContain("getDashboard");
    expect(teacher).not.toContain("prisma");
    expect(teacher).not.toContain("next/");
  });
});
