import {
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";

const repo =
  resolve(
    __dirname,
    "../../../../..",
  );

const css =
  readFileSync(
    resolve(
      repo,
      "apps/zoebuild/src/app/globals.css",
    ),
    "utf8",
  );

describe(
  "ZoeBuild Commerce visual ownership",
  () => {
    it(
      "makes Commerce the scroll owner inside the fixed project shell",
      () => {
        expect(css).toContain(
          "ZOEBUILD_COMMERCE_FLAT_UI_V1",
        );
        expect(css).toContain(
          ".zb-commerce-workspace {",
        );
        expect(css).toContain(
          "overflow-y: auto",
        );
        expect(css).toContain(
          "scrollbar-gutter: stable",
        );
      },
    );

    it(
      "keeps Commerce flat and theme-adaptive without hard-coded light/dark cards",
      () => {
        expect(css).toContain(
          "color-mix(in srgb, Canvas",
        );
        expect(css).toContain(
          "box-shadow: none",
        );
        expect(css).toContain(
          'input[type="password"]',
        );
        expect(css).toContain(
          "ZOEBUILD_STRIPE_PANEL_POLISH_V2",
        );
        expect(css).toContain(
          ".zb-stripe-environments {",
        );
        expect(css).not.toContain(
          ".zb-commerce-workspace > section {",
        );
      },
    );
  },
);
