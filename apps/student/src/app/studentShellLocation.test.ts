import {
  describe,
  expect,
  it,
} from "vitest";

import {
  resolveStudentShellLocation,
} from "./studentRoutes";

describe(
  "StudentAppShell route guard",
  () => {
    it(
      "keeps the bare student origin on Vite",
      () => {
        expect(
          resolveStudentShellLocation(
            "/",
          ),
        ).toEqual({
          kind: "my-learning",
          locale: "en",
        });
      },
    );

    it(
      "keeps the localized student root on Vite",
      () => {
        expect(
          resolveStudentShellLocation(
            "/en",
          ),
        ).toEqual({
          kind: "my-learning",
          locale: "en",
        });
      },
    );

    it(
      "keeps My Learning on Vite",
      () => {
        expect(
          resolveStudentShellLocation(
            "/en/subjects",
          ).kind,
        ).toBe("my-learning");
      },
    );

    it(
      "renders unknown student paths as not found",
      () => {
        expect(
          resolveStudentShellLocation(
            "/en/student-dashboard",
          ),
        ).toEqual({
          kind: "not-found",
          locale: "en",
          path: "/en/student-dashboard",
        });
      },
    );

    it(
      "allows only explicit website routes to leave Vite",
      () => {
        expect(
          resolveStudentShellLocation(
            "/en/billing",
          ).kind,
        ).toBe("website");

        expect(
          resolveStudentShellLocation(
            "/en/sandbox",
          ).kind,
        ).toBe("website");
      },
    );
  },
);
