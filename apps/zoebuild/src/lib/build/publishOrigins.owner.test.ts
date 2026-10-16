import {
  fileURLToPath,
} from "node:url";

import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";

const path =
  fileURLToPath(
    new URL(
      "./publishOrigins.ts",
      import.meta.url,
    ),
  );

describe(
  "ZoeBuild published-site origin isolation",
  () => {
    it(
      "requires an explicit production publishing gate",
      () => {
        const source =
          readFileSync(
            path,
            "utf8",
          );

        expect(
          source,
        ).toContain(
          "ZOEBUILD_PUBLISH_ENABLED",
        );

        expect(
          source,
        ).toContain(
          "ZOEBUILD_PUBLISHED_SITE_ORIGIN",
        );
      },
    );

    it(
      "rejects the authenticated control-plane registrable domain in production",
      () => {
        const source =
          readFileSync(
            path,
            "utf8",
          );

        expect(
          source,
        ).toContain(
          "registrableBoundaryHint",
        );

        expect(
          source,
        ).toContain(
          "separate registrable domain",
        );

        expect(
          source,
        ).toContain(
          'published.protocol !==\n      "https:"',
        );
      },
    );
  },
);
