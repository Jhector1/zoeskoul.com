import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildLocalizedAppUrl,
  getProductionAppOrigin,
  normalizeConfiguredAppOrigin,
  resolveAppOrigin,
  resolveAppRouteOwner,
} from "@zoeskoul/app-config";

describe(
  "shared ZoeSkoul route registry",
  () => {
    it.each([
      "/en/profile",
      "/fr/settings/security",
      "/ht/billing",
      "/es/authenticate",
    ])(
      "assigns %s to the website",
      (pathname) => {
        expect(
          resolveAppRouteOwner({
            pathname,
            currentApp: "student",
          }),
        ).toBe("website");
      },
    );

    it.each([
      "/en/subjects",
      "/en/catalogs",
      "/en/practice/daily",
      "/en/assignments",
      "/en/tutoring-sessions/session-1",
      "/en/python-v2/modules/python-v2-1/learn",
    ])(
      "assigns %s to the student app",
      (pathname) => {
        expect(
          resolveAppRouteOwner({
            pathname,
            currentApp: "student",
          }),
        ).toBe("student");
      },
    );

    it(
      "does not disguise an unknown route as My Learning",
      () => {
        expect(
          resolveAppRouteOwner({
            pathname:
              "/en/not-a-real-route",
            currentApp: "student",
          }),
        ).toBe("unknown");
      },
    );

    it(
      "builds locale-preserving cross-app URLs",
      () => {
        expect(
          buildLocalizedAppUrl({
            origin:
              "http://localhost:3000",
            pathname: "/profile",
            locale: "fr",
          }),
        ).toBe(
          "http://localhost:3000/fr/profile",
        );
      },
    );

    it("normalizes configured deployment origins", () => {
      expect(
        normalizeConfiguredAppOrigin(
          "https://student-preview.example/",
        ),
      ).toBe("https://student-preview.example");
    });

    it.each([
      "javascript:alert(1)",
      "https://user:password@example.com",
      "https://example.com/path",
      "https://example.com?query=1",
      "https://example.com#hash",
      "//example.com",
    ])("rejects invalid configured origin %s", (origin) => {
      expect(normalizeConfiguredAppOrigin(origin)).toBeNull();
    });

    it("maps local Web navigation to each local application", () => {
      expect(
        resolveAppOrigin({
          appId: "student",
          currentOrigin: "http://localhost:3000",
          deploymentEnvironment: "production",
        }),
      ).toBe("http://localhost:3002");
    });

    it("uses configured preview origins before canonical origins", () => {
      expect(
        resolveAppOrigin({
          appId: "student",
          configuredOrigin: "https://student-preview.example/",
          currentOrigin: "https://web-preview.example",
          deploymentEnvironment: "preview",
        }),
      ).toBe("https://student-preview.example");
    });

    it("never falls back to production during preview", () => {
      expect(
        resolveAppOrigin({
          appId: "student",
          currentOrigin: "https://web-preview.example",
          deploymentEnvironment: "preview",
        }),
      ).toBeNull();
    });

    it("keeps canonical production origins for every app owner", () => {
      for (const appId of [
        "website",
        "student",
        "teacher",
        "admin",
      ] as const) {
        expect(
          resolveAppOrigin({
            appId,
            deploymentEnvironment: "production",
          }),
        ).toBe(getProductionAppOrigin(appId));
      }
    });

    it("preserves locale, path, search, and hash through URL construction", () => {
      expect(
        buildLocalizedAppUrl({
          origin: "https://student-preview.example/",
          pathname:
            "/subjects/python-v2/modules?tab=practice#exercise",
          locale: "fr",
        }),
      ).toBe(
        "https://student-preview.example/fr/subjects/python-v2/modules?tab=practice#exercise",
      );
    });
  },
);

describe("shared route constructors", () => {
  it("keeps canonical cross-app route paths stable", async () => {
    const { ROUTES } = await import("@zoeskoul/app-config");

    expect(ROUTES.home).toBe("/");
    expect(ROUTES.myLearning).toBe("/subjects");
    expect(ROUTES.catalogs).toBe("/catalogs");
    expect(ROUTES.catalogDetail("python")).toBe("/catalogs/python");

    expect(ROUTES.subjectModules("python")).toBe(
      "/subjects/python/modules",
    );

    expect(ROUTES.moduleIntro("python", "basics")).toBe(
      "/subjects/python/modules/basics",
    );

    expect(ROUTES.learningPath("python", "basics")).toBe(
      "/subjects/python/modules/basics/learn",
    );

    expect(ROUTES.practicePath("python", "basics")).toBe(
      "/subjects/python/modules/basics/practice",
    );

    expect(ROUTES.dailyPractice).toBe("/practice/daily");
    expect(ROUTES.signIn).toBe("/auth/signin");
    expect(ROUTES.pricing).toBe("/billing");

    expect(ROUTES.teachingCourseAssignments).toBe(
      "/admin/course-assignments",
    );

    expect(ROUTES.adminDashboard).toBe("/admin");
  });
});
