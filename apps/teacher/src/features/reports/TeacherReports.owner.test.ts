import {
  readFileSync,
} from "node:fs";
import {
  describe,
  expect,
  it,
} from "vitest";

const page = readFileSync(
  new URL(
    "./TeacherReportsPage.tsx",
    import.meta.url,
  ),
  "utf8",
);

const client = readFileSync(
  new URL(
    "./teacherReportsClient.ts",
    import.meta.url,
  ),
  "utf8",
);

describe("Teacher Reports ownership", () => {
  it("keeps school reports in the Teacher browser app", () => {
    expect(page).toContain(
      'useTranslations("Teacher.reports")',
    );
    expect(page).toContain(
      "createTeacherReportsClient",
    );
    expect(page).toContain(
      "createTeacherClassesClient",
    );
    expect(page).not.toContain("next/");
    expect(page).not.toContain("prisma");
  });

  it("uses the existing Web Teacher API boundary", () => {
    expect(client).toContain(
      "/api/teacher/schools/",
    );
    expect(client).toContain("/report");
    expect(client).toContain(
      "@zoeskoul/api-client",
    );
  });
});
