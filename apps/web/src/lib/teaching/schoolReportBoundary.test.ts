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

function source(relative: string) {
  return readFileSync(
    resolve(root, relative),
    "utf8",
  );
}

describe("School-wide reporting architecture", () => {
  const schema = source(
    "packages/db/prisma/schema.prisma",
  );
  const report = source(
    "apps/web/src/lib/learningOrganizations/schoolReport.ts",
  );
  const route = source(
    "apps/web/src/app/api/teacher/schools/[id]/report/route.ts",
  );

  it("does not create school-specific progress or grade storage", () => {
    expect(schema).not.toContain(
      "model SchoolProgress {",
    );
    expect(schema).not.toContain(
      "model SchoolGradebook {",
    );
    expect(schema).not.toContain(
      "model SchoolReport {",
    );
  });

  it("composes the canonical class dashboard instead of reimplementing progress queries", () => {
    expect(report).toContain(
      "getLearningGroupDashboard",
    );
    expect(report).not.toContain(
      "reviewProgress.findMany",
    );
    expect(report).not.toContain(
      "practiceAttempt.findMany",
    );
    expect(report).not.toContain(".create(");
    expect(report).not.toContain(".update(");
    expect(report).not.toContain(".upsert(");
  });

  it("limits school-wide reporting to existing school managers", () => {
    expect(route).toContain(
      "getLearningOrganizationAccess",
    );
    expect(route).toContain(
      "resolved.access.canManageSchool",
    );
    expect(route).toContain(
      "isAppOriginAllowed",
    );
    expect(route).toContain(
      "appCorsPreflight",
    );
  });
});
