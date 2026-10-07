import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const cwd = resolve(process.cwd());
const repoRoot = cwd.endsWith("/apps/teacher") ? resolve(cwd, "../..") : cwd;

const workspace = readFileSync(
  resolve(repoRoot, "apps/teacher/src/features/classes/TeacherClassWorkspace.tsx"),
  "utf8",
);
const dashboard = readFileSync(
  resolve(repoRoot, "apps/teacher/src/features/classes/TeacherClassDashboard.tsx"),
  "utf8",
);

function classes(locale: "en" | "fr" | "es" | "ht") {
  return JSON.parse(
    readFileSync(
      resolve(
        repoRoot,
        `apps/teacher/src/i18n/messages/${locale}/ui/teacher/classes.json`,
      ),
      "utf8",
    ),
  ).Teacher.classes;
}

describe("Teacher class workspace hierarchy V246", () => {
  it("keeps courses, assignments, and gradebook as first-class class tabs", () => {
    expect(workspace).toContain(
      'type Tab = "overview" | "students" | "courses" | "assignments" | "gradebook" | "settings"',
    );
    expect(workspace).toContain('key: "assignments"');
    expect(workspace).toContain('key: "gradebook"');

    for (const locale of ["en", "fr", "es", "ht"] as const) {
      const messages = classes(locale);
      expect(messages.workspace.tabs.assignments).toBeTruthy();
      expect(messages.workspace.tabs.gradebook).toBeTruthy();
    }
  });

  it("uses one class dashboard payload for the three content views", () => {
    expect(dashboard).toContain('view?: "overview" | "assignments" | "gradebook"');
    expect(dashboard).toContain('view === "assignments"');
    expect(dashboard).toContain('view === "gradebook"');
    expect(workspace).toContain('view={');
  });

  it("keeps announcements on overview rather than nesting them inside assignments", () => {
    const overview = dashboard.indexOf('{view === "overview" ? (');
    const assignments = dashboard.indexOf('{view === "assignments" ? (');
    const gradebook = dashboard.indexOf('{view === "gradebook" ? (');

    expect(overview).toBeGreaterThan(-1);
    expect(assignments).toBeGreaterThan(overview);
    expect(gradebook).toBeGreaterThan(assignments);
    expect(dashboard).toContain("<details");
    expect(dashboard).toContain('dashboard.announcementsHint');
    expect(dashboard).toContain("<TeacherAnnouncementsPanel");
  });
});
