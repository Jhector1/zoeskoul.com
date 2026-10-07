import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const cwd = resolve(process.cwd());
const repoRoot = cwd.endsWith("/apps/teacher") ? resolve(cwd, "../..") : cwd;

const dashboard = readFileSync(
  resolve(repoRoot, "apps/teacher/src/features/classes/TeacherClassDashboard.tsx"),
  "utf8",
);
const client = readFileSync(
  resolve(repoRoot, "apps/teacher/src/features/classes/teacherClassesClient.ts"),
  "utf8",
);
const messages = JSON.parse(
  readFileSync(
    resolve(repoRoot, "apps/teacher/src/i18n/messages/en/ui/teacher/classes.json"),
    "utf8",
  ),
).Teacher.classes.dashboard;

describe("Teacher class dashboard clarity V244", () => {
  it("calls class content assignments instead of assigned courses", () => {
    expect(messages.sections.assignments).toBe("Assignments");
    expect(messages.emptyAssignments).toContain("No assignments");
    expect(messages.assignmentMeta).toContain("Course:");
  });

  it("requests the class dashboard in the active locale", () => {
    expect(dashboard).toContain("props.locale");
    expect(client).toContain("dashboard?locale=");
    expect(client).toContain("encodeURIComponent(locale)");
  });
});
