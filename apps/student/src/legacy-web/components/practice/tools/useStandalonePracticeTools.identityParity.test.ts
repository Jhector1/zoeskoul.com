import { describe, expect, it } from "vitest";

import { getExerciseStateKey } from "@zoeskoul/learning-runtime/review/module/runtime/exerciseKeys";
import { normalizeTopicProgressKey } from "@zoeskoul/learning-runtime";
import { resolveStandalonePracticeToolsIdentity } from "./useStandalonePracticeTools";

describe("standalone Practice canonical Tools identity", () => {
  it("matches the canonical Quiz/Review owner for whole-module Practice", () => {
    const exerciseId =
      "ci-constructors-and-object-state-add-method";

    const identity = resolveStandalonePracticeToolsIdentity({
      exerciseId,
      experienceMode: "practice" as any,
      subjectSlug: "applied-python-projects",
      moduleSlug: "python-8-object-oriented-foundations",
      sectionSlug: null,
      topicSlug: "py8.constructors-and-object-state",
      exercise: {
        id: exerciseId,
        exerciseKey: exerciseId,
        topic: "py8.constructors-and-object-state",
      },
      item: {
        exercise: {
          id: exerciseId,
          exerciseKey: exerciseId,
          topic: "py8.constructors-and-object-state",
        },
      },
      selectedTargets: [
        {
          exerciseKey: exerciseId,
          sectionSlug:
            "applied-python-projects-python-8-object-foundations",
          topicSlug: "py8.constructors-and-object-state",
        },
      ],
    });

    const expectedTopic = normalizeTopicProgressKey(
      "py8.constructors-and-object-state",
    );

    const expectedKey = getExerciseStateKey(
      {
        subjectSlug: "applied-python-projects",
        moduleSlug: "python-8-object-oriented-foundations",
        sectionSlug:
          "applied-python-projects-python-8-object-foundations",
        topicId: expectedTopic,
        cardId: "standalone-practice",
      },
      exerciseId,
    );

    expect(identity.sourceCoordinates).toMatchObject({
      subjectSlug: "applied-python-projects",
      moduleSlug: "python-8-object-oriented-foundations",
      sectionSlug:
        "applied-python-projects-python-8-object-foundations",
      topicSlug: "py8.constructors-and-object-state",
    });

    expect(identity.topicId).toBe(
      "constructors-and-object-state",
    );
    expect(identity.exerciseStateKey).toBe(expectedKey);
    expect(identity.exerciseStateKey).not.toContain(":unknown:");
    expect(identity.exerciseStateKey).not.toContain(
      ":py8.constructors-and-object-state:",
    );
  });

  it("uses exercise/item coordinates when selectedTargets are absent", () => {
    const identity = resolveStandalonePracticeToolsIdentity({
      exerciseId: "daily-one",
      experienceMode: "daily" as any,
      subjectSlug: "python",
      moduleSlug: "module",
      sectionSlug: null,
      topicSlug: null,
      exercise: {
        id: "daily-one",
        exerciseKey: "daily-one",
        sectionSlug: "loops",
        topicSlug: "py1.while-loops",
      },
      item: null,
      selectedTargets: null,
    });

    expect(identity.sourceCoordinates.sectionSlug).toBe("loops");
    expect(identity.topicId).toBe("while-loops");
    expect(identity.exerciseStateKey).not.toContain(":unknown:");
  });
});
