import {
  readFileSync,
} from "node:fs";
import {
  describe,
  expect,
  it,
} from "vitest";

function source(name: string) {
  return readFileSync(
    new URL(
      name,
      import.meta.url,
    ),
    "utf8",
  );
}

const page =
  source(
    "./TeacherAssignmentsPage.tsx",
  );
const editor =
  source(
    "./TeacherAssignmentEditor.tsx",
  );
const invites =
  source(
    "./TeacherAssignmentInvites.tsx",
  );
const client =
  source(
    "./teacherAssignmentsClient.ts",
  );

describe(
  "Teacher Assignments ownership",
  () => {
    it(
      "uses the existing LearningAssignment APIs through shared transport",
      () => {
        expect(client).toContain(
          "@zoeskoul/api-client",
        );
        expect(client).toContain(
          "/api/teacher/course-assignments",
        );
        expect(client).not.toContain(
          "/api/admin/course-assignments",
        );
      },
    );

    it(
      "reuses the existing Classes client for LearningGroup audiences",
      () => {
        expect(editor).toContain(
          "createTeacherClassesClient",
        );
        expect(editor).toContain(
          "groupIds",
        );
      },
    );

    it(
      "uses JSON translations and imports no Next browser runtime",
      () => {
        for (const text of [
          page,
          editor,
          invites,
        ]) {
          expect(text).toContain(
            "useTranslations",
          );
        }

        const combined =
          page +
          editor +
          invites +
          client;

        for (const forbidden of [
          'from "next/',
          "@/i18n/navigation",
          "server-only",
          "prisma.",
        ]) {
          expect(
            combined,
          ).not.toContain(
            forbidden,
          );
        }

        for (const hardcoded of [
          "Assign a private course",
          "Edit course assignment",
          "Student instructions",
          "Official solution visibility",
          "Individual student emails",
          "Create a student group first",
          "Delete this course assignment?",
          "No private course assignments yet.",
        ]) {
          expect(
            combined,
          ).not.toContain(
            hardcoded,
          );
        }
      },
    );

    it(
      "preserves invitation link and email actions",
      () => {
        expect(invites).toContain(
          '"link"',
        );
        expect(invites).toContain(
          '"email"',
        );
        expect(invites).toContain(
          "navigator.clipboard.writeText",
        );
      },
    );
  },
);
