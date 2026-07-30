import { describe, expect, it } from "vitest";

import {
  buildStandalonePracticeToolsResetKey,
  isStandalonePracticeCodeExercise,
  resolveStandalonePracticeTopicId,
} from "./useStandalonePracticeTools";

describe("buildStandalonePracticeToolsResetKey", () => {
  it("stays stable for the same practice session context", () => {
    const first = buildStandalonePracticeToolsResetKey({
      experienceMode: "standard",
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-2",
      runtimeResetRevision: 3,
    });
    const next = buildStandalonePracticeToolsResetKey({
      experienceMode: "standard",
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-2",
      runtimeResetRevision: 3,
    });

    expect(next).toBe(first);
  });

  it("changes for an explicit runtime reset", () => {
    const before = buildStandalonePracticeToolsResetKey({
      experienceMode: "standard",
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-2",
      runtimeResetRevision: 3,
    });
    const after = buildStandalonePracticeToolsResetKey({
      experienceMode: "standard",
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-2",
      runtimeResetRevision: 4,
    });

    expect(after).not.toBe(before);
  });
});

describe("isStandalonePracticeCodeExercise", () => {
  it("shows the tools workspace only for code-input questions", () => {
    expect(isStandalonePracticeCodeExercise("code_input")).toBe(true);
    expect(isStandalonePracticeCodeExercise("single_choice")).toBe(false);
    expect(isStandalonePracticeCodeExercise("ordering")).toBe(false);
    expect(isStandalonePracticeCodeExercise(null)).toBe(false);
  });
});

describe("resolveStandalonePracticeTopicId", () => {
  it("uses the same canonical topic key as practice exercise registration", () => {
    expect(
      resolveStandalonePracticeTopicId(
        "pyv2_3.for-loops-over-text",
        "all",
      ),
    ).toBe("for-loops-over-text");
  });

  it("keeps ordinary topic slugs unchanged", () => {
    expect(resolveStandalonePracticeTopicId("if-elif-else")).toBe(
      "if-elif-else",
    );
  });
});
