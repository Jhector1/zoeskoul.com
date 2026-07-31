import {
  describe,
  expect,
  it,
} from "vitest";

import {
  resolveStudentLocation,
} from "./studentRoutes";

describe(
  "student application roots",
  () => {
    it(
      "keeps the bare student origin inside Vite",
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

    it.each([
      ["en", "/en"],
      ["es", "/es"],
      ["fr", "/fr"],
      ["ht", "/ht"],
    ])(
      "keeps /%s inside the Vite student application",
      (locale, pathname) => {
        expect(
          resolveStudentLocation(
            pathname,
          ),
        ).toEqual({
          kind: "my-learning",
          locale,
        });
      },
    );

    it(
      "still sends billing and sandbox to Next",
      () => {
        expect(
          resolveStudentLocation(
            "/en/billing",
          ).kind,
        ).toBe("website");

        expect(
          resolveStudentLocation(
            "/en/sandbox",
          ).kind,
        ).toBe("website");
      },
    );
  },
);
