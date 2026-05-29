import { describe, expect, it } from "vitest";
import { buildReviewTargetRegistry } from "./reviewTargetRegistry";

describe("buildReviewTargetRegistry project manifest binding", () => {
  it("builds a manifest-bound project exercise entry for an authored step", () => {
    const registry = buildReviewTargetRegistry({
      subjectSlug: "python-data-functions",
      moduleSlug: "python-6-functions-and-modularity",
      mod: {
        id: "python-6-functions-and-modularity",
        title: "Functions",
        startPracticeSectionSlug: "section-a",
        topics: [],
        sections: [
          {
            id: "section-a",
            slug: "section-a",
            title: "Section A",
            order: 1,
            topics: [
              {
                id: "using-imports-and-helper-files",
                label: "Topic",
                cards: [
                  {
                    type: "project",
                    id: "project",
                    spec: {
                      mode: "project",
                      subject: "python-data-functions",
                      steps: [
                        {
                          id: "using-imports-create-name-module",
                          topic: "using-imports-and-helper-files",
                          exerciseKey: "using-imports-create-name-module",
                        },
                      ],
                    },
                  },
                ],
                meta: {
                  rawManifest: {
                    topicId: "using-imports-and-helper-files",
                    exercises: [
                      {
                        id: "using-imports-create-name-module",
                        kind: "code_input",
                        messageBase: "topics.python-data-functions.python-6-functions-and-modularity.using-imports-and-helper-files.projectSteps.using-imports-create-name-module",
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
    } as any);

    const entry = Object.values(registry.byKey).find(
      (item) =>
        item.targetKind === "exercise" &&
        item.exerciseId === "using-imports-create-name-module",
    );

    expect(entry).toMatchObject({
      targetKind: "exercise",
      exerciseId: "using-imports-create-name-module",
      targetSlug: "using-imports-create-name-module",
    });
    expect((entry?.toolManifest as any)?.id).toBe("using-imports-create-name-module");
  });

  it("throws when a project step references a missing authored exercise", () => {
    expect(() =>
      buildReviewTargetRegistry({
        subjectSlug: "python-data-functions",
        moduleSlug: "python-6-functions-and-modularity",
        mod: {
          id: "python-6-functions-and-modularity",
          title: "Functions",
          startPracticeSectionSlug: "section-a",
          topics: [],
          sections: [
            {
              id: "section-a",
              slug: "section-a",
              title: "Section A",
              order: 1,
              topics: [
                {
                  id: "using-imports-and-helper-files",
                  label: "Topic",
                  cards: [
                    {
                      type: "project",
                      id: "project",
                      spec: {
                        mode: "project",
                        subject: "python-data-functions",
                        steps: [
                          {
                            id: "step-1",
                            topic: "using-imports-and-helper-files",
                            exerciseKey: "missing-exercise",
                          },
                        ],
                      },
                    },
                  ],
                  meta: {
                    rawManifest: {
                      topicId: "using-imports-and-helper-files",
                      exercises: [{ id: "real-exercise", kind: "code_input" }],
                    },
                  },
                },
              ],
            },
          ],
        },
      } as any),
    ).toThrow(
      'Project step points to missing exerciseKey "missing-exercise" in topic "using-imports-and-helper-files".',
    );
  });
});
