import {
  describe,
  expect,
  it,
} from "vitest";

import {
  ZoeBuildAiConfigurationError,
  resolveZoeBuildAiConfig,
} from "./createZoeBuildAiPlanner";

describe("ZoeBuild AI provider configuration", () => {
  it("requires product-specific provider and model env", () => {
    expect(() =>
      resolveZoeBuildAiConfig({}),
    ).toThrowError(
      ZoeBuildAiConfigurationError,
    );
  });

  it("accepts neutral Build providers", () => {
    expect(
      resolveZoeBuildAiConfig({
        ZOEBUILD_AI_PROVIDER: "gemini",
        ZOEBUILD_AI_MODEL: "gemini-test-model",
      }),
    ).toEqual({
      provider: "gemini",
      model: "gemini-test-model",
    });
  });

  it("does not inherit curriculum AI provider env accidentally", () => {
    expect(() =>
      resolveZoeBuildAiConfig({
        AI_PROVIDER: "gemini",
        AI_MODEL: "curriculum-model",
      }),
    ).toThrowError(
      ZoeBuildAiConfigurationError,
    );
  });
});
