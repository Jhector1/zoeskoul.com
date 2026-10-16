import {
  describe,
  expect,
  it,
} from "vitest";

import {
  BuildAccessError,
  assertCanGenerateBuildWithAi,
} from "./index";

describe("ZoeBuild AI generation access", () => {
  it("requires authentication", () => {
    expect(() =>
      assertCanGenerateBuildWithAi({
        userId: null,
        entitlements: ["build_ai_generate"],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "BUILD_AUTH_REQUIRED",
      }),
    );
  });

  it("requires the canonical build_ai_generate entitlement", () => {
    expect(() =>
      assertCanGenerateBuildWithAi({
        userId: "user_1",
        entitlements: [],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "BUILD_ACCESS_DENIED",
      }),
    );

    expect(
      assertCanGenerateBuildWithAi({
        userId: " user_1 ",
        entitlements: ["build_ai_generate"],
      }),
    ).toBe("user_1");
  });

  it("uses the Build access error type", () => {
    try {
      assertCanGenerateBuildWithAi({
        userId: "user_1",
        entitlements: [],
      });
    } catch (error) {
      expect(error).toBeInstanceOf(BuildAccessError);
    }
  });
});
