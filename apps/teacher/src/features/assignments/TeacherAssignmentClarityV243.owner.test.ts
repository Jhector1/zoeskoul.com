import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const cwd = resolve(process.cwd());
const repoRoot = cwd.endsWith("/apps/teacher") ? resolve(cwd, "../..") : cwd;
const editor = readFileSync(
  resolve(repoRoot, "apps/teacher/src/features/assignments/TeacherAssignmentEditor.tsx"),
  "utf8",
);
const client = readFileSync(
  resolve(repoRoot, "apps/teacher/src/features/assignments/teacherAssignmentsClient.ts"),
  "utf8",
);
const messages = JSON.parse(
  readFileSync(
    resolve(repoRoot, "apps/teacher/src/i18n/messages/en/ui/teacher/assignments.json"),
    "utf8",
  ),
).Teacher.assignments;

describe("Teacher assignment clarity V243", () => {
  it("keeps slug internal and automatically generated for new assignments", () => {
    expect(editor).toContain("automaticAssignmentSlug");
    expect(editor).toContain("Date.now().toString(36)");
    expect(editor).not.toContain('t("editor.slug")');
    expect(editor).not.toContain("course.slug");
    expect(client).toContain("slug: string");
  });

  it("makes course, assignment, and audience roles explicit", () => {
    expect(messages.title).toBe("Assignments");
    expect(messages.editor.editTitle).toBe("Edit assignment");
    expect(messages.editor.studentEmails).toBe("Individual learners");
    expect(messages.editor.groups).toBe("Classes (learner groups)");
    expect(messages.editor.accessNote).toContain("Assign course content");
  });

  it("uses compact class selection and a delivery summary", () => {
    expect(editor).toContain('className="h-4 w-4 shrink-0 accent-neutral-900"');
    expect(editor).toContain("assignmentSummary");
    expect(editor).toContain("summaryClassOne");
    expect(editor).toContain("summaryLearnerOne");
  });
});
