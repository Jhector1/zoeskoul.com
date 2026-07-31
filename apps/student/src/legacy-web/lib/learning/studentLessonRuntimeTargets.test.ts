import {
  describe,
  expect,
  it,
} from "vitest";

import {
  hasForbiddenLearningLessonFields,
  isLearningLessonContentResponse,
} from "@zoeskoul/learning-contracts";

import {
  buildStudentLessonContent,
} from "./studentLessonContentData";

function overview() {
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
    stats: {
      sectionsCount: 1,
      topicsCount: 1,
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
            order: 1,
          },
        ],
      },
    ],
  };
}

function reviewModule() {
  return {
    id: "module-1",
    title: "Module 1",
    topics: [
      {
        id: "python.topic-1",
        label: "Topic 1",
        summary: "Practice safely.",
        cards: [
          {
            type: "text",
            id: "read-with-try-it",
            title: "Read and try",
            markdown: "Read first.",
            tryIt: {
              id: "try-read",
              exerciseKey: "hidden-exercise-key",
              prompt: "Secret prompt",
              spec: {
                solutionCode: "print('secret')",
                hiddenTests: ["secret test"],
              },
            },
          },
          {
            type: "sketch",
            id: "sketch-1",
            title: "Sketch",
            sketchId: "secret-sketch-registry-id",
            props: {
              expectedSolution: "secret",
            },
            tryIt: {
              id: "try-sketch-1",
              exerciseKey:
                "secret-sketch-exercise-key",
              spec: {
                solutionCode:
                  "print('secret')",
              },
            },
          },
          {
            type: "quiz",
            id: "quiz-1",
            title: "Quiz",
            spec: {
              answerKey: "secret-answer",
              tests: ["secret test"],
            },
          },
          {
            type: "project",
            id: "project-1",
            title: "Project",
            spec: {
              solutionFiles: [
                {
                  path: "answer.py",
                  content: "print('secret')",
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe("student lesson runtime target projection", () => {
  it("projects stable identity without authored runtime payloads", () => {
    const result = buildStudentLessonContent({
      overview: overview() as never,
      reviewModule: reviewModule() as never,
    });

    const cards =
      result.sections[0].topics[0].cards;

    expect(cards[0]).toMatchObject({
      type: "text",
      id: "read-with-try-it",
      runtimeRequired: true,
      runtime: {
        version: 1,
        sectionSlug: "section-1",
        topicSlug: "topic-1",
        ownerCardId: "read-with-try-it",
        targetKind: "embedded_try_it",
        targetId: "try-read",
        runtimeKind: "try_it",
      },
    });

    expect(cards.slice(1)).toMatchObject([
      {
        type: "runtime",
        id: "sketch-1",
        runtimeKind: "sketch",
        runtime: {
          targetKind: "card",
          targetId: "sketch-1",
        },
        embeddedRuntime: {
          ownerCardId: "sketch-1",
          targetKind: "embedded_try_it",
          targetId: "try-sketch-1",
          runtimeKind: "try_it",
        },
      },
      {
        type: "runtime",
        id: "quiz-1",
        runtimeKind: "quiz",
        runtime: {
          targetKind: "card",
          targetId: "quiz-1",
        },
      },
      {
        type: "runtime",
        id: "project-1",
        runtimeKind: "project",
        runtime: {
          targetKind: "card",
          targetId: "project-1",
        },
      },
    ]);

    expect(
      hasForbiddenLearningLessonFields(result),
    ).toBe(false);
    expect(
      isLearningLessonContentResponse(result),
    ).toBe(true);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("secret-answer");
    expect(serialized).not.toContain("secret test");
    expect(serialized).not.toContain("hidden-exercise-key");
    expect(serialized).not.toContain(
      "secret-sketch-exercise-key",
    );
    expect(serialized).not.toContain("secret-sketch-registry-id");
    expect(serialized).not.toContain("solutionCode");
    expect(serialized).not.toContain("solutionFiles");
    expect(serialized).not.toContain("expectedSolution");
  });
});
