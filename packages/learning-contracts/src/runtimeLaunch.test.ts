import {
  describe,
  expect,
  it,
} from "vitest";

import {
  isLearningRuntimeLaunchResponse,
} from "./index";

function response() {
  return {
    target: {
      version: 1,
      sectionSlug: "section-1",
      topicSlug: "topic-1",
      ownerCardId: "sketch-1",
      targetKind: "card",
      targetId: "sketch-1",
      runtimeKind: "sketch",
    },
    title: "Sketch",
    activity: {
      kind: "legacy_handoff",
      href: "/en/subjects/python/modules/module-1/learn",
      reason: "runtime_not_migrated",
    },
  };
}

describe("runtime launch response", () => {
  it("accepts a protected legacy handoff", () => {
    expect(
      isLearningRuntimeLaunchResponse(response()),
    ).toBe(true);
  });

  it("rejects non-relative handoff URLs", () => {
    const value = response();
    value.activity.href = "https://untrusted.example";

    expect(
      isLearningRuntimeLaunchResponse(value),
    ).toBe(false);
  });

  it("rejects solution-bearing fields recursively", () => {
    const value = response() as Record<string, unknown>;
    value.solutionCode = "secret";

    expect(
      isLearningRuntimeLaunchResponse(value),
    ).toBe(false);
  });
});
