import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./TeacherClassesPage.tsx", import.meta.url), "utf8");
const editor = readFileSync(new URL("./TeacherClassEditor.tsx", import.meta.url), "utf8");
const invites = readFileSync(new URL("./TeacherClassInvites.tsx", import.meta.url), "utf8");
const client = readFileSync(new URL("./teacherClassesClient.ts", import.meta.url), "utf8");

describe("Teacher Classes ownership", () => {
  it("uses JSON translations for class invitation copy", () => {
    for (const source of [page, editor, invites]) expect(source).toContain("useTranslations");
    for (const forbidden of [
      "Student groups",
      "New student group",
      "Edit student group",
      "Pending class invitations",
      "Copy invite link",
      "Send email",
    ]) {
      expect(page + editor + invites).not.toContain(forbidden);
    }
  });

  it("keeps class work on existing browser APIs", () => {
    expect(client).toContain("@zoeskoul/api-client");
    expect(client).toContain("/api/teacher/learning-groups");
    expect(client).toContain("/api/teacher/schools");
    expect(client).toContain("/invites");
    expect(editor).toContain("organizationId");
    expect(editor).toContain("TeacherClassInvites");
    for (const forbidden of ["next/", "server-only", "prisma"]) {
      expect(page + editor + invites + client).not.toContain(forbidden);
    }
  });

  it("keeps class invites separate from assignment and tutoring UI", () => {
    expect(invites).toContain("Teacher.classes.invites");
    expect(invites + client).not.toContain("TeacherAssignmentInvites");
    expect(invites + client).not.toContain("/tutoring-sessions/");
  });
});
