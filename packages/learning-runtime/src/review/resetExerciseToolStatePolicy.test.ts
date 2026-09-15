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

  it("removes the reset exercise from the parent-card practice patch while preserving unrelated compatibility state", () => {
    const exerciseStateKey =
      "python-v2:python-v2-1:section:f-strings-and-formatting:f-strings-and-formatting_s0:ci_print_profile_line";

    const staleWorkspace = {
      version: 2,
      nodes: [
        {
          id: "file:main.py",
          kind: "file",
          name: "main.py",
          parentId: null,
          content: "STALE_LEARNER_CODE",
        },
      ],
    };

    const next = stripResetExerciseToolState(
      {
        quizState: {
          "f-strings-and-formatting_s0": {
            answers: {
              unrelatedAnswer: "preserve-me",
            },
            practiceItemPatch: {
              [exerciseStateKey]: {
                exerciseKey: exerciseStateKey,
                exerciseId: "ci_print_profile_line",
                cardId: "f-strings-and-formatting_s0",
                workspace: staleWorkspace,
                userEdited: true,
              },
              "python-v2:python-v2-1:section:f-strings-and-formatting:f-strings-and-formatting_s0:other-exercise": {
                exerciseId: "other-exercise",
                cardId: "f-strings-and-formatting_s0",
                workspace: {
                  version: 2,
                  nodes: [],
                },
              },
            },
          },
          "other-card": {
            practiceItemPatch: {
              "python-v2:python-v2-1:section:f-strings-and-formatting:other-card:ci_print_profile_line": {
                exerciseId: "ci_print_profile_line",
                cardId: "other-card",
                workspace: staleWorkspace,
              },
            },
          },
        },
      },
      {
        exerciseStateKey,
        exerciseId: "ci_print_profile_line",
        runtimeCardId: "f-strings-and-formatting_s0",
      },
    );

    expect(
      next.quizState?.["f-strings-and-formatting_s0"]?.practiceItemPatch,
    ).not.toHaveProperty(exerciseStateKey);

    expect(
      next.quizState?.["f-strings-and-formatting_s0"]?.practiceItemPatch,
    ).toHaveProperty(
      "python-v2:python-v2-1:section:f-strings-and-formatting:f-strings-and-formatting_s0:other-exercise",
    );

    expect(
      next.quizState?.["f-strings-and-formatting_s0"]?.answers,
    ).toEqual({
      unrelatedAnswer: "preserve-me",
    });

    expect(
      next.quizState?.["other-card"]?.practiceItemPatch?.[
        "python-v2:python-v2-1:section:f-strings-and-formatting:other-card:ci_print_profile_line"
      ],
    ).toBeDefined();
  });

  it("removes a parent-card legacy exercise-id alias when no exact state key is available", () => {
    const next = stripResetExerciseToolState(
      {
        quizState: {
          "parent-card": {
            practiceItemPatch: {
              "ci_print_profile_line": {
                exerciseId: "ci_print_profile_line",
                cardId: "parent-card",
                workspace: {
                  version: 2,
                  nodes: [],
                },
              },
              "other-exercise": {
                exerciseId: "other-exercise",
                cardId: "parent-card",
              },
            },
          },
        },
      },
      {
        exerciseId: "ci_print_profile_line",
        runtimeCardId: "parent-card",
      },
    );

    expect(
      next.quizState?.["parent-card"]?.practiceItemPatch,
    ).not.toHaveProperty("ci_print_profile_line");

    expect(
      next.quizState?.["parent-card"]?.practiceItemPatch,
    ).toHaveProperty("other-exercise");
  });

});
