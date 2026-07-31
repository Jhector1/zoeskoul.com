import {
  describe,
  expect,
  it,
} from "vitest";

import {
  resolveStudentLayout,
  shouldRenderGlobalStudentHeader,
} from "./studentLayout";

describe(
  "student route-specific layouts",
  () => {
    it.each([
      "lesson",
      "daily-practice",
      "module-practice",
    ])(
      "uses only the internal workspace header for %s",
      (kind) => {
        const location = {
          kind,
        };

        expect(
          resolveStudentLayout(
            location,
          ),
        ).toBe("workspace");

        expect(
          shouldRenderGlobalStudentHeader(
            location,
          ),
        ).toBe(false);
      },
    );

    it.each([
      "my-learning",
      "catalogs",
      "catalog",
      "assignments",
      "tutoring",
      "course",
      "module",
    ])(
      "uses HeaderSlick for %s",
      (kind) => {
        const location = {
          kind,
        };

        expect(
          resolveStudentLayout(
            location,
          ),
        ).toBe("navigation");

        expect(
          shouldRenderGlobalStudentHeader(
            location,
          ),
        ).toBe(true);
      },
    );

    it(
      "does not render a student header while redirecting to Next",
      () => {
        const location = {
          kind: "website",
        };

        expect(
          resolveStudentLayout(
            location,
          ),
        ).toBe("website");

        expect(
          shouldRenderGlobalStudentHeader(
            location,
          ),
        ).toBe(false);
      },
    );
  },
);
