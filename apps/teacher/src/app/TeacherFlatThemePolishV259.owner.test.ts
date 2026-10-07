import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const cwd = path.resolve(process.cwd());
const teacherRoot = cwd.endsWith("/apps/teacher") ? cwd : path.resolve(cwd, "apps/teacher");
const source = (relativePath: string) => fs.readFileSync(path.join(teacherRoot, relativePath), "utf8");

const tutoring = source("src/features/tutoring/TeacherTutoringDashboard.tsx");
const workspace = source("src/features/classes/TeacherClassWorkspace.tsx");
const school = source("src/features/school/TeacherSchoolPage.tsx");
const assignmentEditor = source("src/features/assignments/TeacherAssignmentEditor.tsx");
const classInvites = source("src/features/classes/TeacherClassInvites.tsx");
const assignments = source("src/features/assignments/TeacherAssignmentsPage.tsx");

describe("Teacher flat theme polish V259", () => {
  it("themes native controls with shared semantic helpers", () => {
    expect(tutoring).toContain("ui-focus-ring ui-border-soft ui-bg-surface ui-text");
    expect(school).toContain("ui-focus-ring ui-border-soft ui-bg-surface ui-text");
    expect(assignmentEditor).toContain("ui-focus-ring ui-border-soft ui-bg-surface ui-text");
    expect(tutoring).not.toContain('className="rounded-lg border px-3 py-2"');
  });
  it("uses soft token borders for workspace tabs", () => {
    for (const text of [tutoring, workspace, school]) {
      expect(text).toContain("border-b ui-border-soft");
      expect(text).not.toContain("dark:border-white/10");
      expect(text).not.toContain("dark:border-white dark:text-white");
    }
  });
  it("removes legacy white invitation and assignment surfaces", () => {
    expect(classInvites).toContain("ui-surface space-y-4 rounded-lg");
    expect(assignments).toContain("ui-surface overflow-x-auto rounded-lg");
  });
  it("keeps canonical shared theme ownership", () => {
    expect(source("src/styles.css")).toContain("packages/ui-styles/ui.css");
  });
});
