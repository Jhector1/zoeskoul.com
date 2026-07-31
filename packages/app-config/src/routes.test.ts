import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildLocalizedAppUrl,
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
  },
);
