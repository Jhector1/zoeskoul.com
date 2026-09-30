import fs from "node:fs";
import path from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";

const root = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(
    path.join(root, relativePath),
    "utf8",
  );
}

function readFieldList(
  source: string,
): string[] {
  const match =
    source.match(
      /const TRY_IT_EXERCISE_STEP_FIELDS = \[([\s\S]*?)\] as const;/,
    );

  if (!match) {
    throw new Error(
      "TRY_IT_EXERCISE_STEP_FIELDS not found",
    );
  }

  return Array.from(
    match[1].matchAll(
      /"([^"]+)"/g,
    ),
    (entry) => entry[1],
  );
}

describe(
  "Draft Preview embedded Try It manifest parity",
  () => {
    it(
      "preserves every canonical runtime Try It structural field",
      () => {
        const preview =
          read(
            "apps/web/src/lib/dev/curriculumDrafts/preview.ts",
          );

        const runtime =
          read(
            "packages/curriculum-runtime/src/compat/buildReviewFromManifest.ts",
          );

        const previewFields =
          readFieldList(
            preview,
          );

        const runtimeFields =
          readFieldList(
            runtime,
          );

        for (
          const field
          of runtimeFields
        ) {
          expect(
            previewFields,
          ).toContain(
            field,
          );
        }
      },
    );

    it(
      "keeps fill-blank presentation structural data in Draft Preview",
      () => {
        const preview =
          read(
            "apps/web/src/lib/dev/curriculumDrafts/preview.ts",
          );

        const fields =
          readFieldList(
            preview,
          );

        expect(fields).toContain(
          "messageBase",
        );

        expect(fields).toContain(
          "choiceCount",
        );

        expect(fields).toContain(
          "expected",
        );
      },
    );

    it(
      "does not hardcode learner-facing template or choices into preview",
      () => {
        const preview =
          read(
            "apps/web/src/lib/dev/curriculumDrafts/preview.ts",
          );

        const fields =
          readFieldList(
            preview,
          );

        expect(fields).not.toContain(
          "template",
        );

        expect(fields).not.toContain(
          "choices",
        );

        expect(fields).not.toContain(
          "correctValue",
        );
      },
    );
  },
);
