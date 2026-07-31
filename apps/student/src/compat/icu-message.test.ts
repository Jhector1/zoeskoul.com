import {
  describe,
  expect,
  it,
} from "vitest";

import {
  formatIcuMessage,
} from "./icu-message";

const message =
  "{count, plural, =0 {No courses} one {# course} other {# courses}}";

describe(
  "ICU message compatibility",
  () => {
    it(
      "resolves zero, singular, and plural counts",
      () => {
        expect(
          formatIcuMessage(
            message,
            { count: 0 },
            "en",
          ),
        ).toBe("No courses");

        expect(
          formatIcuMessage(
            message,
            { count: 1 },
            "en",
          ),
        ).toBe("1 course");

        expect(
          formatIcuMessage(
            message,
            { count: 12 },
            "en",
          ),
        ).toBe("12 courses");
      },
    );
  },
);
