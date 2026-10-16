import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";

const css =
  readFileSync(
    new URL(
      "../../app/globals.css",
      import.meta.url,
    ),
    "utf8",
  );

describe(
  "ZoeBuild Code workspace height ownership",
  () => {
    it(
      "does not reserve a blank grid row when save feedback is absent",
      () => {
        expect(css).toContain(
          "ZOEBUILD_CODE_HEIGHT_FIX_V301E5",
        );

        expect(css).not.toContain(
          "grid-template-rows: auto auto minmax(0, 1fr);",
        );
      },
    );

    it(
      "lets canonical FullIDE consume all remaining Code height",
      () => {
        expect(css).toMatch(
          /\.zb-code-workspace\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;/,
        );

        expect(css).toMatch(
          /\.zb-code-fullide\s*\{[\s\S]*?flex:\s*1 1 auto;/,
        );
      },
    );

    it(
      "keeps save controls content-sized",
      () => {
        expect(css).toContain(
          ".zb-code-savebar,\n.zb-code-save-message",
        );

        expect(css).toContain(
          "flex: 0 0 auto;",
        );
      },
    );
  },
);
