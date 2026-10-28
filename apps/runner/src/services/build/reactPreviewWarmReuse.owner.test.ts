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

        // startReactPreview is now the drain-safe lease wrapper.
        // Cold-start capacity remains inside the internal implementation.
        const startIndex =
          source.indexOf(
            "async function startReactPreviewInternal(",
          );
        const reuseCall =
          source.indexOf(
            "await reuseExistingProjectPreview(",
            startIndex,
          );
        const reserveCall =
          source.indexOf(
            "reservePreviewCapacity(",
            startIndex,
          );
        const wrapperIndex =
          source.indexOf(
            "export async function startReactPreview(",
          );

        expect(startIndex).toBeGreaterThan(-1);
        expect(reuseCall).toBeGreaterThan(startIndex);
        expect(reserveCall).toBeGreaterThan(reuseCall);
        expect(wrapperIndex).toBeGreaterThan(reserveCall);

        const wrapper = source.slice(
          wrapperIndex,
          source.indexOf(
            "export async function drainReactPreviewsForProject(",
            wrapperIndex,
          ),
        );
        expect(wrapper).toContain("projectDrains.beginStart(");
        expect(wrapper).toContain("await startReactPreviewInternal(input)");
        expect(wrapper).toContain("finally {");
        expect(wrapper).toContain("finish();");
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
