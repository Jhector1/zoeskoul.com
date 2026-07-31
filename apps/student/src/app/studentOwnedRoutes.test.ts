import {
  describe,
  expect,
  it,
} from "vitest";

import {
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
