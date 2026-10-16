import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(
    process.cwd(),
    "src/services/build/reactPreviewRuntime.ts",
  ),
  "utf8",
);

describe(
  "React/Vite preview transient-cache ownership",
  () => {
    it(
      "derives tmpfs ownership from the trusted runtime user instead of hard-coding UID/GID",
      () => {
        expect(source).toContain(
          "/^(\\d+):(\\d+)$/.exec(",
        );
        expect(source).toContain("options.User");
        expect(source).toContain(
          "Trusted React preview runtime user must be numeric UID:GID.",
        );
        expect(source).toContain(
          "`uid=${viteTmpfsUser[1]},gid=${viteTmpfsUser[2]},mode=0700`",
        );
        expect(source).not.toContain("uid=1000,gid=1000");
      },
    );

    it(
      "makes both Vite transient cache tmpfs mounts writable only by the runtime UID/GID",
      () => {
        expect(source).toContain(
          "[`${REACT_VITE_V1_PREBUILT_ROOT}/node_modules/.vite`]",
        );
        expect(source).toContain(
          "`rw,noexec,nosuid,size=64m,${viteTmpfsOwnership}`",
        );
        expect(source).toContain(
          "[`${REACT_VITE_V1_PREBUILT_ROOT}/node_modules/.vite-temp`]",
        );
        expect(source).toContain(
          "`rw,noexec,nosuid,size=32m,${viteTmpfsOwnership}`",
        );
      },
    );

    it(
      "preserves the isolated preview network boundary",
      () => {
        expect(source).toContain(
          'NetworkMode:\n            "none"',
        );
      },
    );
  },
);
