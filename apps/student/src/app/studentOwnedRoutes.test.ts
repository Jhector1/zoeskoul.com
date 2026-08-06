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
            "/en/achievements",
          ),
        ).toBe(true);
        expect(
          isPublicStudentPath(
            "/en/leaderboard",
          ),
        ).toBe(true);
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
      "resolves the final learner parity routes exactly",
      () => {
        expect(
          resolveStudentLocation(
            "/en/achievements",
          ),
        ).toEqual({
          kind: "achievements",
          locale: "en",
        });
        expect(
          resolveStudentLocation(
            "/fr/leaderboard",
          ),
        ).toEqual({
          kind: "leaderboard",
          locale: "fr",
        });
        expect(
          resolveStudentLocation(
            "/en/subjects/python/progress",
          ),
        ).toEqual({
          kind: "progress",
          locale: "en",
          subjectSlug: "python",
        });
        expect(
          resolveStudentLocation(
            "/en/subjects/python/certificate",
          ),
        ).toEqual({
          kind: "certificate",
          locale: "en",
          subjectSlug: "python",
        });
        expect(
          resolveStudentLocation(
            "/en/subjects/python/assignments",
          ),
        ).toEqual({
          kind: "subject-assignments",
          locale: "en",
          subjectSlug: "python",
        });
        expect(
          resolveStudentLocation(
            "/en/tutoring-sessions/session-1",
          ),
        ).toEqual({
          kind: "tutoring-session",
          locale: "en",
          sessionId: "session-1",
        });

        for (const path of [
          "/en/tutoring-sessions/session-1/subjects/python/modules/module-1/learn",
          "/en/tutoring-sessions/session-1/subjects/python/modules/module-1/learn/section/topic/exercise/first",
        ]) {
          expect(
            resolveStudentLocation(path),
          ).toEqual({
            kind: "tutoring-session",
            locale: "en",
            sessionId: "session-1",
            subjectSlug: "python",
            moduleSlug: "module-1",
          });
        }
      },
    );

    it(
      "keeps the implemented canonical course flow exact",
      () => {
        expect(
          resolveStudentLocation(
            "/fr/subjects/python/modules",
          ),
        ).toEqual({
          kind: "course",
          locale: "fr",
          subjectSlug: "python",
        });

        expect(
          resolveStudentLocation(
            "/fr/subjects/python/modules/module-1",
          ),
        ).toEqual({
          kind: "module",
          locale: "fr",
          subjectSlug: "python",
          moduleSlug: "module-1",
        });

        expect(
          resolveStudentLocation(
            "/fr/subjects/python/modules/module-1/practice",
          ),
        ).toEqual({
          kind: "module-practice",
          locale: "fr",
          subjectSlug: "python",
          moduleSlug: "module-1",
        });

        for (const path of [
          "/fr/subjects/python/modules/module-1/learn",
          "/fr/subjects/python/modules/module-1/learn/section/topic/exercise/first",
        ]) {
          expect(
            resolveStudentLocation(path),
          ).toEqual({
            kind: "lesson",
            locale: "fr",
            subjectSlug: "python",
            moduleSlug: "module-1",
          });
        }
      },
    );

    it(
      "rejects partial and trailing canonical course paths",
      () => {
        for (const path of [
          "/en/assignments/extra",
          "/en/subjects/python/assignments/extra",
          "/en/achievements/extra",
          "/en/leaderboard/extra",
          "/en/subjects/python/progress/extra",
          "/en/subjects/python/certificate/extra",
          "/en/tutoring-sessions/session-1/extra",
          "/en/tutoring-sessions/session-1/subjects/python/modules/module-1/learn/section",
          "/en/tutoring-sessions/session-1/subjects/python/modules/module-1/learn/section/topic/exercise/first/extra",
          "/en/subjects/python/modules/extra/trailing",
          "/en/subjects/python/modules/module-1/practice/extra",
          "/en/subjects/python/modules/module-1/learn/section",
          "/en/subjects/python/modules/module-1/learn/section/topic/exercise",
          "/en/subjects/python/modules/module-1/learn/section/topic/exercise/first/extra",
        ]) {
          expect(
            resolveStudentLocation(path),
          ).toEqual({
            kind: "not-found",
            locale: "en",
            path,
          });
        }
      },
    );

    it(
      "opens exact catalog-prefixed lesson routes in the review player",
      () => {
        for (const path of [
          "/en/catalog/core/subjects/python/modules/module-1/learn",
          "/en/catalog/core/subjects/python/modules/module-1/learn/section/topic/exercise/first",
        ]) {
          expect(
            resolveStudentLocation(path),
          ).toEqual({
            kind: "lesson",
            locale: "en",
            subjectSlug: "python",
            moduleSlug: "module-1",
          });
        }

        for (const path of [
          "/en/catalog/core/subjects/python/modules/module-1",
          "/en/catalog/core/subjects/python/modules/module-1/learn/section",
          "/en/catalog/core/subjects/python/modules/module-1/learn/section/topic/exercise/first/extra",
        ]) {
          expect(
            resolveStudentLocation(path),
          ).toEqual({
            kind: "not-found",
            locale: "en",
            path,
          });
        }
      },
    );

  },
);
