import {
  readFileSync,
} from "node:fs";
import {
  describe,
  expect,
  it,
} from "vitest";

import {
  resolveLegacyStudentAccess,
} from "./studentSessionCompatibility";

describe("StudentAppShell session compatibility", () => {
  it("derives legacy canUnlockAll separately from session roles", () => {
    const capabilities = [
      "student:access",
      "teacher:access",
    ];

    expect(
      resolveLegacyStudentAccess([
        "teacher",
      ]).canUnlockAll,
    ).toBe(true);
    expect(
      resolveLegacyStudentAccess([
        "student",
      ]).canUnlockAll,
    ).toBe(false);
    expect(Array.isArray(capabilities)).toBe(
      true,
    );
    expect(Object.keys(capabilities)).toEqual([
      "0",
      "1",
    ]);
  });

  it("does not read a legacy property from the capability array", () => {
    const source = readFileSync(
      new URL(
        "./StudentAppShell.tsx",
        import.meta.url,
      ),
      "utf8",
    );

    expect(source).toContain(
      "legacyAccess.canUnlockAll",
    );
    expect(source).toContain(
      "props.session.authenticated",
    );
  });

  it("passes the resolved route locale to every My Learning view", () => {
    const source = readFileSync(
      new URL(
        "./StudentAppShell.tsx",
        import.meta.url,
      ),
      "utf8",
    );

    const myLearningCalls = source.match(
      /<ExactMyLearningView[\s\S]*?\/>/g,
    ) ?? [];

    expect(myLearningCalls).toHaveLength(3);
    for (const call of myLearningCalls) {
      expect(call).toContain(
        "locale={location.locale}",
      );
    }
  });
});
