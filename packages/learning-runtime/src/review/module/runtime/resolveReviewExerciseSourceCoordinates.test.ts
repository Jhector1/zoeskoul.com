import { describe, expect, it } from "vitest";

import { resolveReviewExerciseSourceCoordinates } from "./resolveReviewExerciseSourceCoordinates";

describe("resolveReviewExerciseSourceCoordinates", () => {
  it("uses canonical selected-target section/topic for standalone Practice", () => {
    expect(
      resolveReviewExerciseSourceCoordinates({
        exerciseKey: "ci-constructors-and-object-state-add-method",
        subjectSlug: "applied-python-projects",
        moduleSlug: "python-8-object-oriented-foundations",
        sectionSlug: "",
        topicSlug: "py8.constructors-and-object-state",
        exercise: {
          id: "ci-constructors-and-object-state-add-method",
          topic: "py8.constructors-and-object-state",
        },
        selectedTargets: [
          {
            exerciseKey: "ci-constructors-and-object-state-add-method",
            sectionSlug: "object-oriented-programming",
            topicSlug: "py8.constructors-and-object-state",
          },
        ],
      }),
    ).toEqual({
      subjectSlug: "applied-python-projects",
      moduleSlug: "python-8-object-oriented-foundations",
      sectionSlug: "object-oriented-programming",
      topicSlug: "py8.constructors-and-object-state",
    });
  });

  it("does not borrow coordinates from another exercise", () => {
    expect(
      resolveReviewExerciseSourceCoordinates({
        exerciseKey: "target",
        subjectSlug: "python",
        moduleSlug: "module",
        sectionSlug: "fallback-section",
        topicSlug: "fallback-topic",
        selectedTargets: [
          {
            exerciseKey: "other",
            sectionSlug: "wrong-section",
            topicSlug: "wrong-topic",
          },
        ],
      }),
    ).toEqual({
      subjectSlug: "python",
      moduleSlug: "module",
      sectionSlug: "fallback-section",
      topicSlug: "fallback-topic",
    });
  });

  it("supports Daily/Challenge item metadata without a module target list", () => {
    expect(
      resolveReviewExerciseSourceCoordinates({
        exerciseKey: "daily-one",
        subjectSlug: "python",
        moduleSlug: "module",
        exercise: {
          id: "daily-one",
          sectionSlug: "loops",
          topicSlug: "while-loops",
        },
        selectedTargets: null,
      }),
    ).toEqual({
      subjectSlug: "python",
      moduleSlug: "module",
      sectionSlug: "loops",
      topicSlug: "while-loops",
    });
  });
});
