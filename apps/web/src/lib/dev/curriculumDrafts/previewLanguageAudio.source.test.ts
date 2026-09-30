import {
  describe,
  expect,
  it,
} from "vitest";

import {
  readFileSync,
} from "node:fs";

import {
  resolve,
} from "node:path";

describe(
  "curriculum draft preview language audio",
  () => {
    it(
      "preserves paragraph sketch audio when Draft QA resolves the sketch",
      () => {
        const source =
          readFileSync(
            resolve(
              process.cwd(),
              "apps/web/src/lib/dev/curriculumDrafts/preview.ts",
            ),
            "utf8",
          );

        expect(
          source,
        ).toContain(
          '...(sketch.audio ? { audio: sketch.audio } : {})',
        );

        const paragraphStart =
          source.indexOf(
            'archetype: "paragraph"',
          );

        expect(
          paragraphStart,
        ).toBeGreaterThanOrEqual(
          0,
        );

        const paragraphWindow =
          source.slice(
            paragraphStart,
            paragraphStart + 900,
          );

        expect(
          paragraphWindow,
        ).toContain(
          'bodyMarkdown',
        );

        expect(
          paragraphWindow,
        ).toContain(
          'audio: sketch.audio',
        );
      },
    );
  },
);
