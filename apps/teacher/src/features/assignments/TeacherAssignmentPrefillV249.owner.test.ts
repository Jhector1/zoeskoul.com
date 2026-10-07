import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const cwd = resolve(process.cwd());
const root = cwd.endsWith("/apps/teacher")
  ? resolve(cwd, "../..")
  : cwd;

const source = (path: string) =>
  readFileSync(resolve(root, path), "utf8");

const shell = source(
  "apps/teacher/src/app/TeacherAppShell.tsx",
);
const editor = source(
  "apps/teacher/src/features/assignments/TeacherAssignmentEditor.tsx",
);
const panel = source(
  "apps/teacher/src/features/classes/TeacherClassCoursesPanel.tsx",
);
const workspace = source(
  "apps/web/src/components/teaching/class-course-workspace/ClassCourseWorkspacePage.tsx",
);

describe("Teacher assignment context prefill V249", () => {
  it("parses prefill only for the new-assignment route", () => {
    expect(shell).toContain(
      'location.kind === "assignment-new"',
    );
    expect(shell).toContain(
      'new URLSearchParams(window.location.search)',
    );
    expect(shell).toContain(
      'assignmentSearch?.get("subjectId")',
    );
    expect(shell).toContain(
      'assignmentSearch?.get("classId")',
    );
    expect(shell).toContain(
      "initialSubjectId={assignmentPrefillSubjectId}",
    );
    expect(shell).toContain(
      "initialClassId={assignmentPrefillClassId}",
    );
  });

  it("validates course and class hints before applying them", () => {
    expect(editor).toContain(
      "initialSubjectId?: string | null;",
    );
    expect(editor).toContain(
      "initialClassId?: string | null;",
    );
    expect(editor).toContain(
      "bootstrap.courses.some(",
    );
    expect(editor).toContain(
      "course.id ===",
    );
    expect(editor).toContain(
      "props.initialSubjectId",
    );
    expect(editor).toContain(
      ".get(props.initialClassId)",
    );
    expect(editor).toContain(
      '?.status === "open"',
    );
  });

  it("does not change edit-assignment initialization", () => {
    expect(editor).toContain("assignmentResult");
    expect(editor).toContain("formFromAssignment(");
    expect(editor).toContain("!props.assignmentId &&");
  });

  it("adds context to per-course and workspace Create assignment actions", () => {
    expect(panel).toContain(
      "/assignments/new?subjectId=",
    );
    expect(panel).toContain("course.subjectId");
    expect(panel).toContain("props.classId");

    expect(workspace).toContain(
      "createAssignmentBaseHref",
    );
    expect(workspace).toContain(
      "context.subject.id",
    );
    expect(workspace).toContain("args.classId");
  });

  it("keeps generic assignment creation generic", () => {
    expect(panel).toContain(
      'href="/assignments/new"',
    );
  });
});
