import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";

const cwd = resolve(process.cwd());
const repoRoot = cwd.endsWith(
  "/apps/teacher",
)
  ? resolve(cwd, "../..")
  : cwd;

function source(path: string) {
  return readFileSync(
    resolve(repoRoot, path),
    "utf8",
  );
}

const workspace = source(
  "apps/teacher/src/features/classes/TeacherClassWorkspace.tsx",
);
const panel = source(
  "apps/teacher/src/features/classes/TeacherClassCoursesPanel.tsx",
);
const schema = source(
  "packages/db/prisma/schema.prisma",
);

describe(
  "Teacher Class Courses V247",
  () => {
    it(
      "adds Courses as a first-class Class workspace tab",
      () => {
        expect(workspace).toContain(
          'type Tab = "overview" | "students" | "courses" | "assignments" | "gradebook" | "settings"',
        );
        expect(workspace).toContain(
          'key: "courses"',
        );
        expect(workspace).toContain(
          "TeacherClassCoursesPanel",
        );
      },
    );

    it(
      "derives class courses from assignment subjects using the existing dashboard payload",
      () => {
        expect(panel).toContain(
          "deriveTeacherClassCourses",
        );
        expect(panel).toContain(
          "data?.assignments ?? []",
        );
        expect(panel).toContain(
          ".getDashboard(",
        );
        expect(panel).not.toContain(
          "/api/teacher/learning-groups/",
        );
        expect(panel).not.toContain(
          "/courses",
        );
      },
    );

    it(
      "does not introduce a class-owned Course model",
      () => {
        expect(schema).not.toContain(
          "model ClassCourse",
        );
        expect(schema).not.toContain(
          "model LearningGroupCourse",
        );
        expect(schema).toContain(
          "assignments      LearningAssignmentGroup[]",
        );
      },
    );

    it(
      "keeps create-assignment as the delivery action",
      () => {
        expect(panel).toContain(
          'href="/assignments/new"',
        );
        expect(panel).toContain(
          '"courses.createAssignment"',
        );
      },
    );

    it(
      "keeps EN FR ES HT class workspace copy aligned",
      () => {
        for (const locale of [
          "en",
          "fr",
          "es",
          "ht",
        ]) {
          const messages = JSON.parse(
            source(
              `apps/teacher/src/i18n/messages/${locale}/ui/teacher/classes.json`,
            ),
          ).Teacher.classes;

          expect(
            messages.workspace.tabs.courses,
          ).toBeTruthy();
          expect(
            messages.courses.title,
          ).toBeTruthy();
          expect(
            messages.courses.createAssignment,
          ).toBeTruthy();
        }
      },
    );
  },
);
