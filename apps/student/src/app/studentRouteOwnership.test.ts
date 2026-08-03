import {
  describe,
  expect,
  it,
} from "vitest";

import {
  externalWebsiteHref,
  normalizeStudentPathname,
} from "../compat/app-route-ownership";
import {
  resolveStudentLocation,
} from "./studentRoutes";

describe(
  "student and website route ownership",
  () => {
    it.each([
      ["/", "/en/subjects"],
      ["/en", "/en/subjects"],
      ["/es/", "/es/subjects"],
      ["/fr", "/fr/subjects"],
      ["/ht/", "/ht/subjects"],
    ])(
      "normalizes %s to the student landing route",
      (input, expected) => {
        expect(
          normalizeStudentPathname(
            input,
          ),
        ).toBe(expected);
      },
    );

    it(
      "never redirects a student app root to Next",
      () => {
        for (const path of [
          "/",
          "/en",
          "/en/subjects",
        ]) {
          expect(
            resolveStudentLocation(
              path,
            ).kind,
          ).toBe("my-learning");
        }
      },
    );

    it(
      "keeps student-owned pages in Vite",
      () => {
        for (const path of [
          "/en/subjects",
          "/en/catalogs",
          "/en/assignments",
          "/en/tutoring-sessions",
          "/en/practice/daily",
        ]) {
          expect(
            resolveStudentLocation(
              path,
            ).kind,
          ).not.toBe("website");
        }
      },
    );

    it(
      "redirects only explicit website pages",
      () => {
        for (const path of [
          "/en/billing",
          "/en/sandbox",
          "/en/authenticate",
        ]) {
          expect(
            resolveStudentLocation(
              path,
            ).kind,
          ).toBe("website");
        }
      },
    );

    it(
      "keeps the old Header Home link explicitly on Next",
      () => {
        expect(
          externalWebsiteHref({
            rawHref: "/",
            locale: "en",
            websiteOrigin:
              "http://localhost:3000",
          }),
        ).toBe(
          "http://localhost:3000/en",
        );

        expect(
          externalWebsiteHref({
            rawHref: "/billing",
            locale: "en",
            websiteOrigin:
              "http://localhost:3000",
          }),
        ).toBe(
          "http://localhost:3000/en/billing",
        );
      },
    );
  },
);
