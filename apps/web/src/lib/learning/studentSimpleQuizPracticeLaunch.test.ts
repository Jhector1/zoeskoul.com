import {
  describe,
  expect,
  it,
} from "vitest";

import {
  isStudentSimpleQuizKind,
  resolveStudentSimpleQuizDescriptor,
} from "./studentSimpleQuizPracticeDescriptor";

const target = {
  version: 1 as const,
  sectionSlug: "section-1",
  topicSlug: "topic-1",
  ownerCardId: "quiz-1",
  targetKind: "card" as const,
  targetId: "quiz-1",
  runtimeKind: "quiz" as const,
};

function moduleWithKeys(
  exerciseKeys: string[],
) {
  return {
    id: "module-1",
    title: "Module 1",
    startPracticeSectionSlug:
      "section-1",
    topics: [
      {
        id: "topic-1",
        label: "Topic 1",
        cards: [
          {
            type: "quiz",
            id: "quiz-1",
            title: "Quick check",
            spec: {
              subject: "python",
              moduleSlug:
                "module-1",
              topic: "topic-1",
              difficulty: "easy",
              exerciseKeys,
            },
          },
        ],
      },
    ],
  };
}

describe("student simple quiz practice launch", () => {
  it("resolves one exact authored quiz exercise", () => {
    expect(
      resolveStudentSimpleQuizDescriptor({
        reviewModule:
          moduleWithKeys([
            "exercise-1",
          ]) as never,
        target,
      }),
    ).toMatchObject({
      exerciseKey:
        "exercise-1",
      topicSlug: "topic-1",
      difficulty: "easy",
    });
  });

  it("keeps random and multi-question quiz cards on the legacy runtime", () => {
    expect(
      resolveStudentSimpleQuizDescriptor({
        reviewModule:
          moduleWithKeys([]) as never,
        target,
      }),
    ).toBeNull();

    expect(
      resolveStudentSimpleQuizDescriptor({
        reviewModule:
          moduleWithKeys([
            "exercise-1",
            "exercise-2",
          ]) as never,
        target,
      }),
    ).toBeNull();
  });

  it("limits the first Vite slice to simple answer kinds", () => {
    expect(
      isStudentSimpleQuizKind(
        "single_choice",
      ),
    ).toBe(true);
    expect(
      isStudentSimpleQuizKind(
        "multi_choice",
      ),
    ).toBe(true);
    expect(
      isStudentSimpleQuizKind(
        "numeric",
      ),
    ).toBe(true);
    expect(
      isStudentSimpleQuizKind(
        "code_input",
      ),
    ).toBe(false);
  });
});
