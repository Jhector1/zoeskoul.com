import { describe, expect, it } from "vitest";
import { buildReviewTargetRegistry } from "@zoeskoul/learning-runtime/review/module/runtime/reviewTargetRegistry";
import { getExerciseStateKey } from "@zoeskoul/learning-runtime/review/module/runtime/exerciseKeys";

describe("reviewTargetRegistry embedded Try It canonical ownership", () => {
  it("creates a hidden canonical exercise owner without adding a navigation step", () => {
    const registry = buildReviewTargetRegistry({
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-0",
      resolveMessage: (key: string) => key,
      mod: {
        id: "python-v2-0",
        sections: [
          {
            slug: "python-v2-0-1",
            topics: [
              {
                id: "print-comments-and-errors",
                meta: {
                  rawManifest: {
                    exercises: [
                      {
                        id: "try-print-message",
                        exerciseKey: "try-print-message",
                        kind: "code_input",
                        language: "python",
                        workspace: {
                          language: "python",
                          entryFilePath: "main.py",
                          starterFiles: [
                            {
                              path: "main.py",
                              content: 'print("hello")\n',
                            },
                          ],
                        },
                        recipe: {
                          type: "fixed_tests",
                          solutionCode: 'print("hello")\n',
                        },
                      },
                    ],
                  },
                },
                cards: [
                  {
                    id: "lesson-card",
                    type: "text",
                    tryIt: {
                      id: "lesson-card-try-it",
                      exerciseKey: "try-print-message",
                      required: true,
                      spec: {
                        steps: [
                          {
                            exerciseKey: "try-print-message",
                          },
                        ],
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      } as any,
    });

    const exerciseStateKey = getExerciseStateKey(
      {
        subjectSlug: "python-v2",
        moduleSlug: "python-v2-0",
        sectionSlug: "python-v2-0-1",
        topicId: "print-comments-and-errors",
        cardId: "lesson-card",
      },
      "try-print-message",
    );
    const targetKey = `exercise:${exerciseStateKey}`;
    const entry = registry.byKey[targetKey];

    expect(entry).toMatchObject({
      targetKey,
      targetKind: "exercise",
      ownerKind: "exercise",
      ownerKey: exerciseStateKey,
      toolScopeKey: exerciseStateKey,
      cardId: "lesson-card",
      exerciseId: "try-print-message",
      exerciseStateKey,
    });
    expect((entry?.toolManifest as any)?.kind).toBe("code_input");
    expect((entry?.toolManifest as any)?.workspace?.entryFilePath).toBe(
      "main.py",
    );

    expect(registry.orderedKeys).not.toContain(targetKey);
    expect(Object.values(registry.byRoute)).not.toContain(targetKey);
    expect(
      registry.orderedKeys.some(
        (key) => registry.byKey[key]?.cardId === "lesson-card",
      ),
    ).toBe(true);
  });
});
