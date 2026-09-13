import { describe, expect, it } from "vitest";

import { stripResetExerciseToolState } from "./resetExerciseToolStatePolicy";

describe("stripResetExerciseToolState", () => {
  it("removes the exact legacy exercise toolState owner on authoritative reset", () => {
    const exerciseStateKey =
      "python:module:section:topic:card:exercise-a";

    const next = stripResetExerciseToolState(
      {
        toolState: {
          [`exercise:${exerciseStateKey}`]: {
            code: "STALE_LEARNER_CODE",
            generation: 0,
            userEdited: true,
          },
          "card:python:module:section:topic:card": {
            code: "keep-card-state",
          },
        },
      },
      {
        exerciseStateKey,
        exerciseId: "exercise-a",
        runtimeCardId: "card",
      },
    );

    expect(next.toolState).not.toHaveProperty(
      `exercise:${exerciseStateKey}`,
    );
    expect(
      next.toolState?.["card:python:module:section:topic:card"],
    ).toEqual({ code: "keep-card-state" });
  });

  it("uses card + exercise identity only as a legacy fallback", () => {
    const next = stripResetExerciseToolState(
      {
        toolState: {
          "exercise:python:module:section:topic:card:exercise-a": {
            code: "remove",
          },
          "exercise:python:module:section:topic:other-card:exercise-a": {
            code: "keep",
          },
        },
      },
      {
        exerciseId: "exercise-a",
        runtimeCardId: "card",
      },
    );

    expect(
      next.toolState?.[
        "exercise:python:module:section:topic:card:exercise-a"
      ],
    ).toBeUndefined();
    expect(
      next.toolState?.[
        "exercise:python:module:section:topic:other-card:exercise-a"
      ],
    ).toEqual({ code: "keep" });
  });

  it("preserves unrelated toolState entries", () => {
    const original = {
      toolState: {
        "exercise:python:module:section:topic:card:exercise-b": {
          code: "keep",
        },
      },
    };

    const next = stripResetExerciseToolState(original, {
      exerciseStateKey:
        "python:module:section:topic:card:exercise-a",
      exerciseId: "exercise-a",
      runtimeCardId: "card",
    });

    expect(next).toBe(original);
  });
});
