import {
  describe,
  expect,
  it,
} from "vitest";

import {
  hasForbiddenLearningLessonFields,
  isLearningLessonContentResponse,
} from "./index";

function response() {
  return {
    subject: {
      id: "python",
      slug: "python",
      title: "Python",
      description: null,
      imagePublicId: null,
      imageAlt: null,
    },
    module: {
      id: "module-1",
      slug: "module-1",
      title: "Module 1",
      description: null,
      order: 1,
      weekStart: null,
      weekEnd: null,
      meta: {
        estimatedMinutes: null,
        prereqs: [],
        outcomes: [],
        why: [],
        videoUrl: null,
      },
    },
    access: {
      ok: true,
      paid: true,
      reason: "enrolled",
    },
    sections: [
      {
        slug: "section-1",
        title: "Section 1",
        description: null,
        order: 1,
        topics: [
          {
            slug: "topic-1",
            title: "Topic 1",
            summary: null,
            order: 1,
            cards: [
              {
                type: "text",
                id: "read-1",
                title: "Read",
                markdown: "Read this.",
                runtimeRequired: true,
                runtime: {
                  version: 1,
                  sectionSlug: "section-1",
                  topicSlug: "topic-1",
                  ownerCardId: "read-1",
                  targetKind: "embedded_try_it",
                  targetId: "try-read-1",
                  runtimeKind: "try_it",
                },
              },
              {
                type: "runtime",
                id: "quiz-1",
                title: "Quiz",
                runtimeKind: "quiz",
                runtime: {
                  version: 1,
                  sectionSlug: "section-1",
                  topicSlug: "topic-1",
                  ownerCardId: "quiz-1",
                  targetKind: "card",
                  targetId: "quiz-1",
                  runtimeKind: "quiz",
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("learner-safe runtime targets", () => {
  it("accepts identity-only runtime targets", () => {
    expect(
      isLearningLessonContentResponse(response()),
    ).toBe(true);
  });

  it("requires embedded Try It identity when runtimeRequired is true", () => {
    const value = response() as any;
    value.sections[0].topics[0].cards[0].runtime = null;

    expect(
      isLearningLessonContentResponse(value),
    ).toBe(false);
  });

  it("requires runtime-card identity to match the owner card", () => {
    const value = response() as any;
    value.sections[0].topics[0].cards[1].runtime.targetId =
      "different-card";

    expect(
      isLearningLessonContentResponse(value),
    ).toBe(false);
  });

  it.each([
    "solutionCode",
    "solutionFiles",
    "expectedSolution",
    "answerKey",
    "correctAnswer",
    "hiddenTests",
    "tests",
    "sourceChecks",
    "checkSql",
    "revealAnswer",
    "spec",
    "tryIt",
    "recipe",
    "workspace",
    "starterCode",
    "starterFiles",
  ])("rejects the forbidden lesson field %s", (field) => {
    const value = response() as Record<string, unknown>;
    const sections = value.sections as Array<Record<string, unknown>>;
    sections[0][field] = "secret";

    expect(
      hasForbiddenLearningLessonFields(value),
    ).toBe(true);
    expect(
      isLearningLessonContentResponse(value),
    ).toBe(false);
  });
});
