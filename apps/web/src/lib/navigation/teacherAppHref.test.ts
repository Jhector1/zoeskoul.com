import {
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";

import {
  resolveAppRouteOwner,
} from "@zoeskoul/app-config";

import {
  resolveTeacherAppHref,
} from "./teacherAppHref";

function source(relativePath: string) {
  return readFileSync(
    resolve(process.cwd(), relativePath),
    "utf8",
  );
}

describe("Teacher production teaching handoff", () => {
  it("builds locale-preserving Teacher URLs from canonical app config", () => {
    expect(
      resolveTeacherAppHref({
        locale: "fr",
        pathname: "/classes",
        deploymentEnvironment: "development",
        configuredOrigin: null,
      }),
    ).toBe("http://localhost:3003/fr/classes");

    expect(
      resolveTeacherAppHref({
        locale: "en",
        pathname: "/assignments/assignment-1",
        deploymentEnvironment: "production",
        configuredOrigin: null,
      }),
    ).toBe(
      "https://teacher.zoeskoul.com/en/assignments/assignment-1",
    );

    expect(
      resolveTeacherAppHref({
        locale: "ht",
        pathname: "/classes/new",
        deploymentEnvironment: "preview",
        configuredOrigin: "https://teacher-preview.example/",
      }),
    ).toBe(
      "https://teacher-preview.example/ht/classes/new",
    );
  });

  it("never escapes an unconfigured preview into production", () => {
    expect(
      resolveTeacherAppHref({
        locale: "en",
        pathname: "/classes",
        deploymentEnvironment: "preview",
        configuredOrigin: null,
      }),
    ).toBeNull();
  });

  it("preserves the Student and Teacher assignments collision by current app", () => {
    expect(
      resolveAppRouteOwner({
        pathname: "/en/assignments",
        currentApp: "student",
      }),
    ).toBe("student");

    expect(
      resolveAppRouteOwner({
        pathname: "/en/assignments",
        currentApp: "teacher",
      }),
    ).toBe("teacher");

    expect(
      resolveAppRouteOwner({
        pathname: "/en/assignments",
      }),
    ).toBe("student");

    expect(
      resolveAppRouteOwner({
        pathname: "/en/classes",
      }),
    ).toBe("teacher");
  });

  it("hands legacy Web teaching pages to Teacher without deleting their fallback UI", () => {
    const expectations = [
      [
        "apps/web/src/app/(public)/[locale]/(platform)/admin/(teaching)/course-assignments/page.tsx",
        'pathname: "/assignments"',
      ],
      [
        "apps/web/src/app/(public)/[locale]/(platform)/admin/(teaching)/course-assignments/[id]/page.tsx",
        "pathname: `/assignments/${encodeURIComponent(id)}`",
      ],
      [
        "apps/web/src/app/(public)/[locale]/(platform)/admin/(teaching)/learning-groups/page.tsx",
        'pathname: "/classes"',
      ],
      [
        "apps/web/src/app/(public)/[locale]/(platform)/admin/(teaching)/learning-groups/[id]/page.tsx",
        "pathname: `/classes/${encodeURIComponent(id)}`",
      ],
    ] as const;

    for (const [relativePath, pathnameToken] of expectations) {
      const text = source(relativePath);
      expect(text).toContain("resolveTeacherAppHref");
      expect(text).toContain("redirect(teacherAppHref)");
      expect(text).toContain(pathnameToken);
    }
  });

  it("keeps Teacher Classes inside the Teacher app for assignment management", () => {
    const text = source(
      "apps/teacher/src/features/classes/TeacherClassesPage.tsx",
    );

    expect(text).toContain('href="/assignments"');
    expect(text).toContain("<TeacherLink");
    expect(text).not.toContain("/admin/course-assignments");
    expect(text).not.toContain("courseAssignmentsHref");
  });

  it("does not move learner invitations or Teacher APIs out of Web", () => {
    for (const relativePath of [
      "apps/web/src/app/(public)/[locale]/(generalZone)/invitations/class/[token]/page.tsx",
      "apps/web/src/app/(public)/[locale]/(generalZone)/invitations/course/[token]/page.tsx",
      "apps/web/src/app/(public)/[locale]/(generalZone)/invitations/tutoring/[token]/page.tsx",
      "apps/web/src/app/api/teacher/learning-groups/route.ts",
      "apps/web/src/app/api/teacher/course-assignments/route.ts",
    ]) {
      expect(source(relativePath).length).toBeGreaterThan(0);
    }
  });
});
