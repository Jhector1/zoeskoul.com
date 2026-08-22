import {
  describe,
  expect,
  it,
} from "vitest";

import {
  isStudentRouteCutoverReady,
  resolveAppRouteOwner,
  resolveDesiredAppRouteOwner,
  studentRouteCutoverAllowlist,
} from "@zoeskoul/app-config";

describe("ZoeSkoul desired route ownership and cutover gates", () => {
  it.each([
    "/en/assignments/assignment-1",
    "/en/certificates",
    "/en/practice/trial",
    "/en/progress",
    "/en/projects/project-1",
    "/en/sandbox",
    "/en/sandbox/programming/python",
  ])(
    "declares %s as Student-owned without activating it",
    (pathname) => {
      expect(
        resolveDesiredAppRouteOwner({
          pathname,
        }),
      ).toBe("student");
      expect(
        isStudentRouteCutoverReady({
          pathname,
        }),
      ).toBe(false);
    },
  );

  it.each([
    "/en/authenticate",
    "/en/billing",
    "/en/c/invite-code",
    "/en/invitations/course/token-1",
    "/en/invitations/tutoring/token-2",
    "/en/legal/privacy",
    "/en/profile",
    "/en/settings/security",
  ])("keeps %s Website-owned", (pathname) => {
    expect(
      resolveDesiredAppRouteOwner({
        pathname,
      }),
    ).toBe("website");
    expect(
      isStudentRouteCutoverReady({
        pathname,
      }),
    ).toBe(false);
  });

  it("preserves role-specific Teacher and Admin collisions", () => {
    expect(
      resolveDesiredAppRouteOwner({
        pathname: "/en/assignments",
        currentApp: "teacher",
      }),
    ).toBe("teacher");
    expect(
      resolveDesiredAppRouteOwner({
        pathname: "/en/catalogs",
        currentApp: "admin",
      }),
    ).toBe("admin");
    expect(
      resolveDesiredAppRouteOwner({
        pathname: "/en/assignments",
        currentApp: "student",
      }),
    ).toBe("student");
  });

  it("does not change the legacy/current route resolver during Phase 1", () => {
    expect(
      resolveAppRouteOwner({
        pathname: "/en/sandbox/programming/python",
      }),
    ).toBe("website");
    expect(
      resolveAppRouteOwner({
        pathname: "/en/projects/project-1",
      }),
    ).toBe("unknown");
  });

  it("activates only the validated Student route patterns", () => {
    expect(studentRouteCutoverAllowlist).toEqual([
      "/practice/daily",
      "/practice/daily/catalog/:catalogSlug",
      "/practice/daily/catalog/:catalogSlug/course/:subjectSlug",
      "/practice/daily/catalog/:catalogSlug/course/:subjectSlug/module/:moduleSlug",
      "/catalogs",
      "/catalogs/:catalogSlug",
      "/subjects",
      "/assignments",
      "/tutoring-sessions",
      "/achievements",
      "/leaderboard",
      "/subjects/:subjectSlug/progress",
      "/subjects/:subjectSlug/certificate",
      "/subjects/:subjectSlug/assignments",
      "/tutoring-sessions/:sessionId",
      "/tutoring-sessions/:sessionId/subjects/:subjectSlug/modules/:moduleSlug/learn",
      "/tutoring-sessions/:sessionId/subjects/:subjectSlug/modules/:moduleSlug/learn/:sectionSlug/:topicId/:targetKind/:targetSlug",
      "/subjects/:subjectSlug/modules",
      "/subjects/:subjectSlug/modules/:moduleSlug",
      "/subjects/:subjectSlug/modules/:moduleSlug/practice",
      "/subjects/:subjectSlug/modules/:moduleSlug/learn",
      "/subjects/:subjectSlug/modules/:moduleSlug/learn/:sectionSlug/:topicId/:targetKind/:targetSlug",
      "/catalog/:catalogSlug/subjects/:subjectSlug/modules/:moduleSlug/learn",
      "/catalog/:catalogSlug/subjects/:subjectSlug/modules/:moduleSlug/learn/:sectionSlug/:topicId/:targetKind/:targetSlug",
    ]);
  });

  it.each([
    "/en/practice/daily",
    "/fr/practice/daily?source=home",
    "/ht/practice/daily#today",
    "/en/practice/daily/catalog/python",
    "/fr/practice/daily/catalog/python/course/python-v2",
    "/ht/practice/daily/catalog/sql/course/sql-v2/module/sql-v2-2",
    "/en/catalogs",
    "/fr/catalogs?source=header",
    "/ht/catalogs/core",
    "/en/catalogs/data-analysis?source=home",
    "/en/subjects",
    "/fr/subjects?source=header",
    "/ht/subjects#learning",
    "/en/assignments",
    "/fr/tutoring-sessions?source=my-learning",
    "/en/achievements",
    "/fr/leaderboard?period=all_time",
    "/ht/subjects/python/progress",
    "/en/subjects/python/certificate",
    "/fr/subjects/python/assignments",
    "/fr/tutoring-sessions/session-1/subjects/python/modules/module-1/learn?workspace=mine",
    "/ht/tutoring-sessions/session-1/subjects/python/modules/module-1/learn/section/topic/exercise/first#answer",
    "/ht/subjects/python/modules",
    "/en/subjects/python/modules/module-1",
    "/fr/subjects/python/modules/module-1/practice?mode=assignment",
    "/en/subjects/python/modules/module-1/learn",
    "/ht/subjects/python/modules/module-1/learn/section/topic/exercise/first?attempt=2",
    "/en/catalog/core/subjects/python/modules/module-1/learn",
    "/fr/catalog/core/subjects/python/modules/module-1/learn/section/topic/exercise/first#answer",
  ])("activates the validated Student route %s", (pathname) => {
    expect(
      isStudentRouteCutoverReady({
        pathname,
      }),
    ).toBe(true);
  });

  it.each([
    "/en/practice",
    "/en/practice/daily/extra",
    "/en/practice/trial",
    "/en/assignments/assignment-1",
    "/en/subjects/python/modules/module-1/practice/extra",
    "/en/subjects/python/modules/module-1/learn/section",
    "/en/subjects/python/modules/module-1/learn/section/topic/exercise/first/extra",
    "/en/catalog",
    "/en/catalogs/core/extra",
    "/en/catalogs/core/subjects",
    "/en/catalogs/%2F",
    "/en/catalog/core/subjects/python/modules/module-1",
    "/en/catalog/core/subjects/python/modules/module-1/learn/section",
    "/en/catalog/core/subjects/python/modules/module-1/learn/section/topic/exercise/first/extra",
    "/en/subjects/python",
    "/en/achievements/extra",
    "/en/leaderboard/extra",
    "/en/subjects/python/progress/extra",
    "/en/subjects/python/certificate/extra",
    "/en/subjects/python/assignments/extra",
    "/en/tutoring-sessions/session-1/extra",
    "/en/tutoring-sessions/session-1/subjects/python/modules/module-1/learn/section",
    "/en/tutoring-sessions/session-1/subjects/python/modules/module-1/learn/section/topic/exercise/first/extra",
    "/en/sandbox/programming/python",
  ])("does not broaden the active cutovers to %s", (pathname) => {
    expect(
      isStudentRouteCutoverReady({
        pathname,
      }),
    ).toBe(false);
  });

  it("keeps unknown routes unknown", () => {
    expect(
      resolveDesiredAppRouteOwner({
        pathname: "/en/not-a-real-route",
      }),
    ).toBe("unknown");
  });
});
