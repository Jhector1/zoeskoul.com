import {
  readFileSync,
} from "node:fs";
import {
  describe,
  expect,
  it,
} from "vitest";

const panel = readFileSync(
  new URL(
    "./TeacherSchoolCoursesPanel.tsx",
    import.meta.url,
  ),
  "utf8",
);

const client = readFileSync(
  new URL(
    "./teacherSchoolCoursesClient.ts",
    import.meta.url,
  ),
  "utf8",
);

describe("Teacher School course-access ownership", () => {
  it("stays browser-only in Teacher and uses i18n", () => {
    expect(panel).toContain(
      'useTranslations(',
    );
    expect(panel).toContain(
      '"Teacher.schoolCourses"',
    );

    for (const token of [
      "prisma",
      "server-only",
      "next/",
    ]) {
      expect(
        panel + client,
      ).not.toContain(token);
    }
  });

  it("uses the Web School course-access API instead of a duplicate course store", () => {
    expect(client).toContain(
      "/api/teacher/schools/",
    );
    expect(client).toContain(
      "/courses",
    );
    expect(panel).toContain(
      "createTeacherSchoolCoursesClient",
    );
    expect(panel).not.toContain(
      "@zoeskoul/db",
    );
  });
});
