import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./TeacherClassesPage.tsx", import.meta.url), "utf8");
const editor = readFileSync(new URL("./TeacherClassEditor.tsx", import.meta.url), "utf8");
const wizard = readFileSync(new URL("./TeacherClassCreateWizard.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("./TeacherClassWorkspace.tsx", import.meta.url), "utf8");
const invites = readFileSync(new URL("./TeacherClassInvites.tsx", import.meta.url), "utf8");
const client = readFileSync(new URL("./teacherClassesClient.ts", import.meta.url), "utf8");

describe("Teacher Classes ownership", () => {
  it("uses JSON translations for class setup and invitation copy", () => {
    for (const source of [page, editor, wizard, workspace, invites]) {
      expect(source).toContain("useTranslations");
    }
    for (const forbidden of [
      "Student groups",
      "New student group",
      "Edit student group",
      "Pending class invitations",
      "Copy invite link",
      "Send email",
    ]) {
      expect(page + editor + wizard + workspace + invites).not.toContain(forbidden);
    }
  });

  it("keeps class work on existing browser APIs", () => {
    expect(client).toContain("@zoeskoul/api-client");
    expect(client).toContain("/api/teacher/learning-groups");
    expect(client).toContain("/api/teacher/schools");
    expect(client).toContain("/invites");
    expect(editor + wizard).toContain("organizationId");
    expect(editor).toContain("TeacherClassInvites");
    for (const forbidden of ["next/", "server-only", "prisma"]) {
      expect(page + editor + wizard + workspace + invites + client).not.toContain(forbidden);
    }
  });

  it("creates classes through a guided four-step flow without exposing slug", () => {
    for (const step of ["institution", "details", "students", "review"]) {
      expect(wizard).toContain(`"${step}"`);
    }
    expect(wizard).toContain("client.create");
    expect(wizard).toContain("slugify(form.name)");
    expect(wizard).not.toContain('t("editor.slug")');
  });

  it("organizes class detail into overview, students, courses, assignments, gradebook, and settings", () => {
    expect(workspace).toContain(
      'type Tab = "overview" | "students" | "courses" | "assignments" | "gradebook" | "settings"',
    );
    expect(workspace).toContain("TeacherClassDashboard");
    expect(workspace).toContain('key: "assignments"');
    expect(workspace).toContain('key: "gradebook"');
    expect(workspace).toContain('section="students"');
    expect(workspace).toContain('section="details"');
  });

  it("owns a real draft/open/closed lifecycle without mixing it into delete", () => {
    expect(client).toContain('type TeacherClassStatus = "draft" | "open" | "closed"');
    expect(client).toContain("/status`");
    expect(page).toContain('useState<TeacherClassStatus>("open")');
    expect(page).toContain('lifecycleOrder: TeacherClassStatus[] = ["open", "draft", "closed"]');
    expect(workspace).toContain('changeStatus(status: "open" | "closed")');
    expect(workspace).toContain('t("lifecycle.actions.reopen")');
    expect(editor).toContain('t("editor.dangerTitle")');
    expect(editor).toContain("client.remove");
  });

  it("keeps class invites separate from assignment and tutoring UI", () => {
    expect(invites).toContain("Teacher.classes.invites");
    expect(invites + client).not.toContain("TeacherAssignmentInvites");
    expect(invites + client).not.toContain("/tutoring-sessions/");
  });
});
