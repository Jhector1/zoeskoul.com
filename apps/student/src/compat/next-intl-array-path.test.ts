import {
  describe,
  expect,
  it,
} from "vitest";

import {
  readIntlMessagePath,
} from "./next-intl";

describe(
  "next-intl numeric message paths",
  () => {
    it(
      "resolves authored choice arrays by numeric path segment",
      () => {
        const messages = {
          topics: {
            "python-v2": {
              "python-v2-0": {
                "what-python-is": {
                  quiz: {
                    "fb-python-general-purpose": {
                      choices: [
                        "general-purpose",
                        "physical",
                        "paper-only",
                        "single-use",
                      ],
                    },
                  },
                },
              },
            },
          },
        };

        expect(
          readIntlMessagePath(
            messages,
            "topics.python-v2.python-v2-0.what-python-is.quiz.fb-python-general-purpose.choices.2",
          ),
        ).toBe("paper-only");
      },
    );

    it(
      "rejects a non-numeric lookup inside an array",
      () => {
        expect(
          readIntlMessagePath(
            {
              choices: [
                "first",
              ],
            },
            "choices.not-an-index",
          ),
        ).toBeUndefined();
      },
    );
  },
);
