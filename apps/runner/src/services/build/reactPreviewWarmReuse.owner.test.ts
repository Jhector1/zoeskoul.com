import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";

const source =
  readFileSync(
    new URL(
      "./reactPreviewRuntime.ts",
      import.meta.url,
    ),
    "utf8",
  );

describe(
  "React preview warm reuse ownership",
  () => {
    it(
      "reuses a healthy same-project preview before reserving cold-start capacity",
      () => {
        expect(source).toContain(
          "async function reuseExistingProjectPreview(",
        );

        expect(source).toContain(
          "preview.dependencyFingerprint !==\n        requestedFingerprint",
        );

        expect(source).toContain(
          "await syncPreviewSourceFiles(",
        );

        const reuseCall =
          source.indexOf(
            "await reuseExistingProjectPreview(",
          );

        const startIndex =
          source.indexOf(
            "export async function startReactPreview(",
          );

        const reserveCall =
          source.indexOf(
            "reservePreviewCapacity(",
            startIndex,
          );

        expect(reuseCall).toBeGreaterThan(
          -1,
        );

        expect(reserveCall).toBeGreaterThan(
          reuseCall,
        );
      },
    );

    it(
      "keeps dependency changes on the cold restart path",
      () => {
        expect(source).toContain(
          "await destroyPreview(\n        preview,\n      );",
        );

        expect(source).toContain(
          "await runInstall(",
        );

        expect(source).toContain(
          "await waitForPreviewReady(",
        );
      },
    );

    it(
      "preserves the opaque network-isolated preview boundary",
      () => {
        expect(source).toContain(
          'NetworkMode:\n            "none"',
        );

        expect(source).toContain(
          "randomBytes(\n        24,",
        );

        expect(source).not.toContain(
          "ExposedPorts",
        );
      },
    );
  },
);
