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

  it("keeps @: starter aliases until the registry localizes SQL-v2 exercises", () => {
    const sqlStarter = [
      "-- Return only the name column from the products table.",
      "SELECT ",
      "FROM products;",
      "",
    ].join("\n");
    const starterKey =
      "topics.sql-v2.sql-v2-1.query_one_column.quiz.ci_select_name_from_products.starterCode";

    const registry = buildReviewTargetRegistry({
      subjectSlug: "sql-v2",
      moduleSlug: "sql-v2-1",
      resolveMessage: (key: string) => (key === starterKey ? sqlStarter : undefined),
      mod: {
        id: "sql-v2-1",
        title: "SQL v2",
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
                id: "query_one_column",
                label: "Topic",
                cards: [
                  {
                    type: "project",
                    id: "project",
                    spec: {
                      mode: "project",
                      subject: "sql-v2",
                      steps: [
                        {
                          id: "ci_select_name_from_products",
                          topic: "query_one_column",
                          exerciseKey: "ci_select_name_from_products",
                        },
                      ],
                    },
                  },
                ],
                meta: {
                  rawManifest: {
                    topicId: "query_one_column",
                    exercises: [
                      {
                        id: "ci_select_name_from_products",
                        kind: "code_input",
                        language: "sql",
                        entryFilePath: "query.sql",
                        starterCode: `@:${starterKey}`,
                        starterFiles: [
                          {
                            path: "query.sql",
                            content: `@:${starterKey}`,
                            language: "sql",
                            isEntry: true,
                          },
                        ],
                        workspace: {
                          language: "sql",
                          entryFilePath: "query.sql",
                          starterCode: `@:${starterKey}`,
                          starterFiles: [
                            {
                              path: "query.sql",
                              content: `@:${starterKey}`,
                              language: "sql",
                              isEntry: true,
                            },
                          ],
                        },
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
        item.exerciseId === "ci_select_name_from_products",
    );

    expect(entry?.language).toBe("sql");
    expect(entry?.starterCode).toBe(sqlStarter);
    expect((entry?.starterFiles as any[])?.[0]?.content).toBe(sqlStarter);
    expect((entry?.toolManifest as any)?.starterCode).toBe(sqlStarter);
    expect((entry?.toolManifest as any)?.workspace?.starterCode).toBe(sqlStarter);
    expect((entry?.toolManifest as any)?.workspace?.starterFiles?.[0]?.content).toBe(sqlStarter);
  });

});
