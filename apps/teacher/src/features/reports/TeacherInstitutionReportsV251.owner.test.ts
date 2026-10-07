import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const cwd = path.resolve(process.cwd());
const teacherRoot = cwd.endsWith(
  "/apps/teacher",
)
  ? cwd
  : path.resolve(cwd, "apps/teacher");

const source = (relativePath: string) =>
  fs.readFileSync(
    path.join(
      teacherRoot,
      relativePath,
    ),
    "utf8",
  );

const school = source(
  "src/features/school/TeacherSchoolPage.tsx",
);
const reports = source(
  "src/features/reports/TeacherReportsPage.tsx",
);
const shell = source(
  "src/app/TeacherAppShell.tsx",
);
const routes = source(
  "src/app/teacherRoutes.ts",
);
const header = source(
  "src/app/TeacherHeader.tsx",
);

describe("Teacher Institution Reports V251 ownership", () => {
  it("renders the existing reports owner directly inside the Institution Reports tab", () => {
    expect(school).toContain(
      'import { TeacherReportsPage } from "../reports/TeacherReportsPage";',
    );
    expect(school).toContain('tab === "reports"');
    expect(school).toContain("<TeacherReportsPage");
    expect(school).toContain("fixedSchoolId={school.id}");
    expect(school).toContain("embedded");
    expect(school).not.toContain('TeacherLink href="/reports"');
  });

  it("uses a fixed institution without showing a second institution selector", () => {
    expect(reports).toContain("fixedSchoolId?: string;");
    expect(reports).toContain("embedded?: boolean;");
    expect(reports).toContain(
      'useState(props.fixedSchoolId ?? "")',
    );
    expect(reports).toContain(
      "setSchoolId(props.fixedSchoolId)",
    );
    expect(reports).toContain(
      "{!props.fixedSchoolId ? (",
    );
    expect(reports).toContain(
      'props.embedded ? "hidden"',
    );
  });

  it("reuses the existing report data client instead of duplicating report loading", () => {
    expect(reports).toContain("createTeacherReportsClient");
    expect(reports).toContain(".getSchoolReport(");
    expect(reports).toContain("createTeacherClassesClient");
    expect(school).not.toContain("createTeacherReportsClient");
  });

  it("keeps legacy reports routing but maps its global header context to Institution", () => {
    expect(routes).toContain('kind: "reports"');
    expect(shell).toContain('kind === "reports"');
    expect(shell).toContain('return "institution";');
    expect(header).not.toContain('href: "/reports"');
  });
});
