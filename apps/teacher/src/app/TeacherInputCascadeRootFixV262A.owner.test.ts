import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const cwd = path.resolve(process.cwd());
const teacherRoot = cwd.endsWith("/apps/teacher")
  ? cwd
  : path.resolve(cwd, "apps/teacher");

const read = (relativePath: string) =>
  fs.readFileSync(path.join(teacherRoot, relativePath), "utf8");

describe("Teacher input cascade root fix V262A", () => {
  it("does not reintroduce an unlayered global white input palette", () => {
    const styles = read("src/styles.css");
    expect(styles).not.toMatch(/input\\s*\\{[\\s\\S]*?background\\s*:\\s*#fff/);
  });

  it("keeps Teacher text and datetime inputs on canonical ui-input-ide", () => {
    const tutoring = read("src/features/tutoring/TeacherTutoringDashboard.tsx");
    const school = read("src/features/school/TeacherSchoolPage.tsx");
    const wizard = read("src/features/classes/TeacherClassCreateWizard.tsx");
    expect(tutoring).toContain("ui-input-ide");
    expect(school).toContain("ui-input-ide");
    expect(wizard).toContain("ui-input-ide");
  });

  it("has no duplicate literal className attributes inside Teacher input tags", () => {
    const files = [
      "src/features/announcements/TeacherAnnouncementsPanel.tsx",
      "src/features/school/TeacherSchoolPage.tsx",
    ];
    for (const file of files) {
      const source = read(file);
      const inputs = source.match(/<input\\b[\\s\\S]*?>/g) ?? [];
      for (const input of inputs) {
        const literalClassNames = input.match(/className\\s*=\\s*"[^"]*"/g) ?? [];
        expect(literalClassNames.length).toBeLessThanOrEqual(1);
      }
    }
  });
});
