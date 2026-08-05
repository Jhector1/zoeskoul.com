import {
  describe,
  expect,
  it,
} from "vitest";

import {
  isPublicStudentPath,
  resolveStudentLocation,
} from "./studentRoutes";

describe(
  "student-owned route boundaries",
  () => {
    it(
      "keeps Daily Practice in Vite",
      () => {
        expect(
          resolveStudentLocation(
            "/en/practice/daily",
          ),
        ).toEqual({
          kind: "daily-practice",
          locale: "en",
        });
      },
    );

    it(
      "does not treat Daily Practice descendants as the cutover route",
      () => {
        expect(
          resolveStudentLocation(
            "/en/practice/daily/extra",
          ),
        ).toEqual({
          kind: "not-found",
          locale: "en",
          path: "/en/practice/daily/extra",
        });
      },
    );

    it(
      "keeps only exact catalog list and detail routes public",
      () => {
        expect(
          resolveStudentLocation(
            "/en/catalogs",
          ),
        ).toEqual({
          kind: "catalogs",
          locale: "en",
        });
        expect(
          resolveStudentLocation(
            "/fr/catalogs/core",
          ),
        ).toEqual({
          kind: "catalog-detail",
          locale: "fr",
          catalogSlug: "core",
        });
        expect(
          resolveStudentLocation(
            "/en/catalogs/core/extra",
          ),
        ).toEqual({
          kind: "not-found",
          locale: "en",
          path: "/en/catalogs/core/extra",
        });

        expect(
          isPublicStudentPath(
            "/en/catalogs",
          ),
        ).toBe(true);
        expect(
          isPublicStudentPath(
            "/en/catalogs/core",
          ),
        ).toBe(true);
        expect(
          isPublicStudentPath(
            "/en/catalogs/core/extra",
          ),
        ).toBe(false);
        expect(
          isPublicStudentPath(
            "/en/practice/daily",
          ),
        ).toBe(false);
      },
    );

    it(
      "keeps the localized My Learning entry exact",
      () => {
        expect(
          resolveStudentLocation(
            "/fr/subjects",
          ),
        ).toEqual({
          kind: "my-learning",
          locale: "fr",
        });

        for (const path of [
          "/en/subjects/python",
          "/en/learning/extra",
          "/en/my-learning/extra",
        ]) {
          expect(
            resolveStudentLocation(
              path,
            ),
          ).toEqual({
            kind: "not-found",
            locale: "en",
            path,
          });
        }
      },
    );

    it(
      "keeps assignments and tutoring lists in Vite",
      () => {
        expect(
          resolveStudentLocation(
            "/en/assignments",
          ),
        ).toEqual({
          kind: "assignments",
          locale: "en",
        });

        expect(
          resolveStudentLocation(
            "/en/tutoring-sessions",
          ),
        ).toEqual({
          kind: "tutoring",
          locale: "en",
        });
      },
    );

    it(
      "keeps assignment/module practice in Vite",
      () => {
        expect(
          resolveStudentLocation(
            "/en/subjects/python/modules/module-1/practice",
          ),
        ).toEqual({
          kind: "module-practice",
          locale: "en",
          subjectSlug: "python",
          moduleSlug: "module-1",
        });
      },
    );

    it(
      "keeps the bare student origin in Vite",
      () => {
        expect(
          resolveStudentLocation(
            "/",
          ),
        ).toEqual({
          kind: "my-learning",
          locale: "en",
        });
      },
    );

    it(
      "returns Next-owned pages to the website",
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
      "keeps deep tutoring routes on the student origin",
      () => {
        expect(
          resolveStudentLocation(
            "/en/tutoring-sessions/session-1",
          ).kind,
        ).not.toBe("website");
      },
    );

  },
);
