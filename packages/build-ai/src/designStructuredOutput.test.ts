import {
  describe,
  expect,
  it,
} from "vitest";

import {
  BUILD_COMMERCE_JSON_SCHEMA,
  BUILD_DESIGN_JSON_SCHEMA,
} from "@zoeskoul/build-contracts";

import {
  BUILD_AI_PROJECT_SPECIFICATION_JSON_SCHEMA,
  BUILD_AI_PROJECT_SPECIFICATION_SYSTEM_PROMPT,
} from "./index";

describe(
  "Build AI structured design ownership",
  () => {
    it(
      "requires a nullable commerce architecture field for provider structured output",
      () => {
        expect(
          BUILD_AI_PROJECT_SPECIFICATION_JSON_SCHEMA
            .required,
        ).toContain(
          "commerce",
        );

        expect(
          BUILD_AI_PROJECT_SPECIFICATION_JSON_SCHEMA
            .properties.commerce,
        ).toEqual({
          anyOf: [
            BUILD_COMMERCE_JSON_SCHEMA,
            {
              type: "null",
            },
          ],
        });
      },
    );

    it(
      "requires a nullable design field for provider structured output",
      () => {
        expect(
          BUILD_AI_PROJECT_SPECIFICATION_JSON_SCHEMA
            .required,
        ).toContain(
          "design",
        );

        expect(
          BUILD_AI_PROJECT_SPECIFICATION_JSON_SCHEMA
            .properties
            .design,
        ).toEqual({
          anyOf: [
            BUILD_DESIGN_JSON_SCHEMA,
            {
              type:
                "null",
            },
          ],
        });
      },
    );

    it(
      "keeps model design responsibility presentation-only",
      () => {
        expect(
          BUILD_AI_PROJECT_SPECIFICATION_SYSTEM_PROMPT,
        ).toContain(
          "design is presentation-only structured data",
        );

        expect(
          BUILD_AI_PROJECT_SPECIFICATION_SYSTEM_PROMPT,
        ).toContain(
          "Never put HTML, CSS, JavaScript",
        );

        expect(
          BUILD_AI_PROJECT_SPECIFICATION_SYSTEM_PROMPT,
        ).toContain(
          "design: null",
        );
      },
    );
  },
);
