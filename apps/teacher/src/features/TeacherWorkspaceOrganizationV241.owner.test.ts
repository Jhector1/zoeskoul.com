import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const cwd = resolve(process.cwd());
const root =
  basename(cwd) === "teacher" && basename(dirname(cwd)) === "apps"
    ? resolve(cwd, "../..")
    : cwd;
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Teacher workspace organization V241", () => {
  it("organizes tutoring by work state instead of one long page", () => {
    const page = source("apps/teacher/src/features/tutoring/TeacherTutoringDashboard.tsx");
    for (const label of ["Needs scheduling", "Upcoming", "Availability", "History"]) {
      expect(page).toContain(label);
    }
    expect(page).toContain("overview?.history");
  });

  it("organizes institution work into one tabbed workspace", () => {
    const page = source("apps/teacher/src/features/school/TeacherSchoolPage.tsx");
    for (const tab of [
      '"overview"', '"classes"', '"staff"', '"courses"',
      '"announcements"', '"reports"', '"settings"',
    ]) {
      expect(page).toContain(tab);
    }
    expect(page).toContain("TeacherSchoolCoursesPanel");
    expect(page).toContain("TeacherAnnouncementsPanel");
  });

  it("never turns a failed Home class load into a fake zero", () => {
    const home = source("apps/teacher/src/features/home/TeacherHomePage.tsx");
    expect(home).toContain("setClassesError(true)");
    expect(home).not.toContain("setClasses([])");
    expect(home).toContain('t("loadError.unavailable")');
    expect(home).toContain('t(`classStatus.${group.status}`)');
  });
});
