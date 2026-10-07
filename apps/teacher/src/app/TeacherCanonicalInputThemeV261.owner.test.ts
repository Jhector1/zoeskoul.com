import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const cwd = path.resolve(process.cwd());
const teacherRoot = cwd.endsWith("/apps/teacher")
  ? cwd
  : path.resolve(cwd, "apps/teacher");

const read = (relativePath: string) =>
  fs.readFileSync(path.join(teacherRoot, relativePath), "utf8");

describe("Teacher canonical input theme V261", () => {
  it("uses the shared ui-input-ide helper on management text/date inputs", () => {
    const school = read("src/features/school/TeacherSchoolPage.tsx");
    const tutoring = read("src/features/tutoring/TeacherTutoringDashboard.tsx");

    expect(school).toContain("ui-input-ide");
    expect(tutoring).toContain("ui-input-ide");
    expect(school).not.toContain("bg-white");
    expect(tutoring).not.toContain("bg-white");
  });

  it("keeps theme ownership in the shared UI stylesheet", () => {
    const styles = read("src/styles.css");
    expect(styles).toContain("packages/ui-styles/ui.css");
  });
});
