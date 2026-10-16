import { describe, expect, it } from "vitest";

import { trustedRuntimeCommandEnv } from "./runtimeCommandEnv.js";

describe("trusted runtime command env", () => {
  it("serializes runner-owned argv without introducing a shell", () => {
    expect(
      trustedRuntimeCommandEnv([
        "pnpm",
        "install",
        "--lockfile-only",
        "--ignore-scripts",
      ]),
    ).toBe(
      'RUN_CMD_JSON=["pnpm","install","--lockfile-only","--ignore-scripts"]',
    );
  });

  it("rejects empty argv and NUL-bearing values", () => {
    expect(() => trustedRuntimeCommandEnv([])).toThrow();
    expect(() =>
      trustedRuntimeCommandEnv(["pnpm", "bad\0arg"]),
    ).toThrow();
  });
});
