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
    "/en/achievements",
    "/en/assignments/assignment-1",
    "/en/catalogs",
    "/en/certificates",
    "/en/leaderboard",
    "/en/practice/trial",
    "/en/progress",
    "/en/projects/project-1",
    "/en/sandbox",
    "/en/sandbox/programming/python",
    "/en/subjects/python-v2/certificate",
    "/en/subjects/python-v2/progress",
    "/en/tutoring-sessions/session-1",
    "/en/catalog/core/subjects/python-v2/modules/python-v2-1/learn",
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

  it("activates only the exact Daily Practice route", () => {
    expect(studentRouteCutoverAllowlist).toEqual([
      "/practice/daily",
    ]);

    for (const pathname of [
      "/en/practice/daily",
      "/fr/practice/daily?source=home",
      "/ht/practice/daily#today",
    ]) {
      expect(
        isStudentRouteCutoverReady({
          pathname,
        }),
      ).toBe(true);
    }
  });

  it.each([
    "/en/practice",
    "/en/practice/daily/extra",
    "/en/practice/trial",
    "/en/subjects/python/modules/module-1/practice",
    "/en/catalogs",
    "/en/sandbox/programming/python",
  ])("does not broaden the Daily Practice cutover to %s", (pathname) => {
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
