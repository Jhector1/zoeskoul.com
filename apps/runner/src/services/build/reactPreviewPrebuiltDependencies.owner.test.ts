import {
  createHash,
} from "node:crypto";

import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  REACT_VITE_V1_PREBUILT_LOCK_SHA256,
} from "./reactVitePrebuiltDependencies.js";

const runtimeSource =
  readFileSync(
    new URL(
      "./reactPreviewRuntime.ts",
      import.meta.url,
    ),
    "utf8",
  );

const dockerfile =
  readFileSync(
    new URL(
      "../../../runtime/Dockerfile",
      import.meta.url,
    ),
    "utf8",
  );

const lockfile =
  readFileSync(
    new URL(
      "../../../runtime/react-vite-v1/pnpm-lock.yaml",
      import.meta.url,
    ),
    "utf8",
  );

describe(
  "React/Vite prebuilt preview dependencies",
  () => {
    it(
      "pins the runner constant to the baked canonical lockfile",
      () => {
        expect(
          createHash(
            "sha256",
          )
            .update(
              lockfile,
            )
            .digest(
              "hex",
            ),
        ).toBe(
          REACT_VITE_V1_PREBUILT_LOCK_SHA256,
        );
      },
    );

    it(
      "bakes the frozen dependency tree into the immutable runtime image",
      () => {
        expect(
          dockerfile,
        ).toContain(
          "apps/runner/runtime/react-vite-v1/pnpm-lock.yaml",
        );

        expect(
          dockerfile,
        ).toContain(
          "pnpm install --frozen-lockfile",
        );

        expect(
          dockerfile,
        ).toContain(
          "sha256sum pnpm-lock.yaml",
        );
      },
    );

    it(
      "uses the prebuilt layer only behind exact lock and runtime probes",
      () => {
        expect(
          runtimeSource,
        ).toContain(
          "requestLockSha256(",
        );

        expect(
          runtimeSource,
        ).toContain(
          "REACT_VITE_V1_PREBUILT_LOCK_SHA256",
        );

        expect(
          runtimeSource,
        ).toContain(
          "probePrebuiltReactViteRuntime(",
        );

        expect(
          runtimeSource,
        ).toContain(
          "preparePrebuiltReactViteDependencies(",
        );

        expect(
          runtimeSource,
        ).toContain(
          "if (!usingPrebuiltDependencies)",
        );

        expect(
          runtimeSource,
        ).toContain(
          "await runInstall(",
        );
      },
    );

    it(
      "preserves the opaque network boundary and gives Vite transient cache mounts",
      () => {
        expect(
          runtimeSource,
        ).toContain(
          'NetworkMode:\n            "none"',
        );

        expect(
          runtimeSource,
        ).toContain(
          "node_modules/.vite-temp",
        );

        expect(
          runtimeSource,
        ).not.toContain(
          "PortBindings",
        );

        expect(
          runtimeSource,
        ).not.toContain(
          "ExposedPorts",
        );
      },
    );
  },
);
