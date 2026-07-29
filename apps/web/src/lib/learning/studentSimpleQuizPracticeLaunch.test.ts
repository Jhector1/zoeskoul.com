import {
  describe,
  expect,
  it,
} from "vitest";

import {
  resolveStudentEmbeddedTryItDescriptor,
} from "./studentEmbeddedTryItPracticeDescriptor";
import {
  isEligibleStudentEmbeddedPythonTryIt,
  isProjectedStudentEmbeddedPythonTryIt,
} from "./studentEmbeddedTryItEligibility";
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
  studentRuntimeExerciseKey?: string,
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
            studentRuntimeExerciseKey,
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

  it("uses a migration-only selector without changing the legacy quiz pool", () => {
    expect(
      resolveStudentSimpleQuizDescriptor({
        reviewModule:
          moduleWithKeys(
            [
              "legacy-exercise-1",
              "legacy-exercise-2",
              "legacy-exercise-3",
            ],
            "student-runtime-exercise",
          ) as never,
        target,
      }),
    ).toMatchObject({
      exerciseKey:
        "student-runtime-exercise",
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

const embeddedTarget = {
  version: 1 as const,
  sectionSlug: "section-1",
  topicSlug: "py5.dictionary-basics",
  ownerCardId: "sketch0",
  targetKind: "embedded_try_it" as const,
  targetId: "try-dictionary-basics-sketch0",
  runtimeKind: "try_it" as const,
};

function moduleWithEmbeddedTryIt() {
  return {
    id: "python-5-lists-tuples-and-dictionaries",
    title: "Lists, Tuples, and Dictionaries",
    startPracticeSectionSlug: "section-1",
    topics: [
      {
        id: "dictionary-basics",
        label: "Dictionary basics",
        cards: [
          {
            type: "sketch",
            id: "sketch0",
            title: "Dictionary idea",
            tryIt: {
              id: "try-dictionary-basics-sketch0",
              exerciseKey: "try-dictionary-basics-sketch0",
              difficulty: "easy",
            },
          },
        ],
      },
    ],
  };
}

function fixedTestEmbeddedTryIt() {
  return {
    id: "try-dictionary-basics-sketch0",
    kind: "code_input",
    purpose: "try_it",
    language: "python",
    starterCode: "profile = {}\n",
    starterFiles: [
      {
        path: "main.py",
        content: "profile = {}\n",
        language: "python",
        isEntry: true,
      },
    ],
    workspace: {
      entryFilePath: "main.py",
      starterFiles: [
        {
          path: "main.py",
          content: "profile = {}\n",
          language: "python",
          isEntry: true,
        },
      ],
    },
    recipe: {
      type: "fixed_tests",
      tests: [
        {
          stdin: "",
          stdout: "Ava\n",
          match: "exact",
        },
      ],
      sourceChecks: [
        {
          type: "uses_dict_key",
          key: "name",
        },
      ],
    },
    sourceChecks: [
      {
        type: "uses_dict_key",
        key: "name",
      },
    ],
  };
}

describe("student embedded Try It practice launch", () => {
  it("resolves the exact owner card to Try It to exercise chain", () => {
    expect(
      resolveStudentEmbeddedTryItDescriptor({
        reviewModule: moduleWithEmbeddedTryIt() as never,
        target: embeddedTarget,
      }),
    ).toMatchObject({
      exerciseKey: "try-dictionary-basics-sketch0",
      topicSlug: "dictionary-basics",
      difficulty: "easy",
    });

    expect(
      resolveStudentEmbeddedTryItDescriptor({
        reviewModule: moduleWithEmbeddedTryIt() as never,
        target: {
          ...embeddedTarget,
          targetId: "another-try-it",
        },
      }),
    ).toBeNull();
  });

  it("accepts one-file Python fixed, stdin-test, and semantic recipes", () => {
    const eligible = fixedTestEmbeddedTryIt();

    expect(
      isEligibleStudentEmbeddedPythonTryIt(eligible),
    ).toBe(true);
    expect(
      isEligibleStudentEmbeddedPythonTryIt({
        ...eligible,
        starterFiles: [
          ...eligible.starterFiles,
          { path: "helper.py", content: "" },
        ],
      }),
    ).toBe(false);
    const companionEligible = {
      ...eligible,
      starterFiles: [
        ...eligible.starterFiles,
        {
          path: "data/names.csv",
          content:
            "@:examples.namesCsv",
          language: "csv",
          isEntry: false,
        },
      ],
      workspaceExpectations: {
        requiredFiles: [
          "data/names.csv",
        ],
        requiredFolders: [
          "data",
        ],
      },
      workspace: {
        ...eligible.workspace,
        starterFiles: [
          ...eligible.workspace.starterFiles,
          {
            path: "data/names.csv",
            content:
              "@:examples.namesCsv",
            language: "csv",
            isEntry: false,
          },
        ],
        files: [
          {
            path: "data/names.csv",
            content:
              "name\nAva\n",
            language: "csv",
            isEntry: false,
          },
        ],
        workspaceExpectations: {
          requiredFiles: [
            "data/names.csv",
          ],
          requiredFolders: [
            "data",
          ],
        },
      },
    };

    expect(
      isEligibleStudentEmbeddedPythonTryIt(
        companionEligible,
      ),
    ).toBe(true);
    expect(
      isEligibleStudentEmbeddedPythonTryIt({
        ...companionEligible,
        recipe: {
          ...companionEligible.recipe,
          tests: [
            {
              stdin: "",
              stdout: "Ava\n",
              match: "exact",
              files: [
                {
                  path:
                    "data/names.csv",
                  content:
                    "name\nAva\n",
                  readOnly: false,
                },
              ],
            },
          ],
        },
      }),
    ).toBe(true);
    expect(
      isEligibleStudentEmbeddedPythonTryIt({
        ...companionEligible,
        starterFiles: [
          eligible.starterFiles[0],
          {
            path: "helper.py",
            content:
              "VALUE = 1\n",
            language: "python",
          },
        ],
        workspace: {
          ...companionEligible.workspace,
          starterFiles: [
            eligible.workspace
              .starterFiles[0],
            {
              path: "helper.py",
              content:
                "VALUE = 1\n",
              language: "python",
            },
          ],
          files: [],
          workspaceExpectations: {
            requiredFiles: [],
            requiredFolders: [],
          },
        },
        workspaceExpectations: {
          requiredFiles: [],
          requiredFolders: [],
        },
      }),
    ).toBe(false);
    expect(
      isEligibleStudentEmbeddedPythonTryIt({
        ...eligible,
        fixtureFiles: [
          { path: "input.txt", content: "secret" },
        ],
      }),
    ).toBe(false);
    expect(
      isEligibleStudentEmbeddedPythonTryIt({
        ...eligible,
        supportFiles: [
          { path: "helper.py", content: "VALUE = 1\n" },
        ],
      }),
    ).toBe(false);
    expect(
      isEligibleStudentEmbeddedPythonTryIt({
        ...eligible,
        recipe: {
          ...eligible.recipe,
          tests: [
            {
              stdin: "",
              stdout: "ok\n",
              files: [
                {
                  path: "input.txt",
                  content: "secret",
                },
              ],
            },
          ],
        },
      }),
    ).toBe(false);
    expect(
      isEligibleStudentEmbeddedPythonTryIt({
        ...eligible,
        recipe: {
          ...eligible.recipe,
          semanticChecks: [
            {
              type: "variable_equals",
              name: "profile",
              expected: {},
            },
          ],
        },
      }),
    ).toBe(true);
    expect(
      isEligibleStudentEmbeddedPythonTryIt({
        ...eligible,
        recipe: {
          type: "semantic",
          language: "python",
          semanticChecks: [
            {
              type: "function_returns",
              functionName: "greet",
              args: ["Ava"],
              expected: "Hello, Ava",
            },
          ],
        },
      }),
    ).toBe(true);
    expect(
      isEligibleStudentEmbeddedPythonTryIt({
        ...eligible,
        recipe: {
          type: "semantic",
          language: "python",
          semanticChecks: [],
        },
      }),
    ).toBe(false);
    expect(
      isEligibleStudentEmbeddedPythonTryIt({
        ...eligible,
        recipe: {
          type: "semantic",
          language: "python",
          tests: [
            {
              stdin: "",
              stdout: "Ava\n",
            },
          ],
          semanticChecks: [
            {
              type: "function_returns",
              functionName: "greet",
              args: ["Ava"],
              expected: "Hello, Ava",
            },
          ],
        },
      }),
    ).toBe(false);
    expect(
      isEligibleStudentEmbeddedPythonTryIt({
        ...eligible,
        recipe: {
          ...eligible.recipe,
          tests: [
            {
              stdin: "Ava\n",
              stdout: "Ava\n",
              match: "exact",
            },
            {
              stdin: "Noah\n",
              stdout: "Noah\n",
              match: "exact",
            },
          ],
        },
      }),
    ).toBe(true);
    expect(
      isEligibleStudentEmbeddedPythonTryIt({
        ...eligible,
        starterStdin: "Ava\n",
      }),
    ).toBe(false);
    expect(
      isEligibleStudentEmbeddedPythonTryIt({
        ...eligible,
        stdin: "Ava\n",
      }),
    ).toBe(false);
    expect(
      isEligibleStudentEmbeddedPythonTryIt({
        ...eligible,
        recipe: {
          ...eligible.recipe,
          tests: [
            {
              stdout: "Ava\n",
              match: "exact",
            },
          ],
        },
      }),
    ).toBe(false);
    expect(
      isEligibleStudentEmbeddedPythonTryIt({
        ...eligible,
        recipe: {
          ...eligible.recipe,
          tests: [
            {
              stdin: "",
              stdout: "Done\n",
              match: "exact",
              files: [
                {
                  path: "note.txt",
                  content: "",
                  readOnly: false,
                },
              ],
            },
          ],
          sourceChecks: [
            {
              type: "source_contains",
              pattern: "note.txt",
            },
          ],
        },
        sourceChecks: [
          {
            type: "source_contains",
            pattern: "note.txt",
          },
        ],
        workspaceExpectations: {
          requiredFiles: [],
          requiredFolders: [],
        },
        workspace: {
          ...eligible.workspace,
          workspaceExpectations: {
            requiredFiles: [],
            requiredFolders: [],
          },
        },
      }),
    ).toBe(true);
    expect(
      isEligibleStudentEmbeddedPythonTryIt({
        ...eligible,
        recipe: {
          ...eligible.recipe,
          tests: [
            {
              stdin: "",
              stdout: "Ava\n",
              match: "exact",
              files: [
                {
                  path: "tools/names.py",
                  content:
                    "def clean_name(value):\n    return value.strip()\n",
                  readOnly: false,
                },
              ],
            },
          ],
        },
      }),
    ).toBe(false);
    expect(
      isEligibleStudentEmbeddedPythonTryIt({
        ...eligible,
        recipe: {
          ...eligible.recipe,
          tests: [
            {
              stdin: "",
              stdout: "Ava\n",
              match: "exact",
              files: [
                {
                  path: "note.txt",
                  content: "",
                  readOnly: false,
                },
              ],
            },
          ],
          sourceChecks: [
            {
              type: "source_regex",
              path: "note.txt",
              pattern: "Done",
            },
          ],
        },
      }),
    ).toBe(false);
    expect(
      isEligibleStudentEmbeddedPythonTryIt({
        ...eligible,
        recipe: {
          ...eligible.recipe,
          tests: [
            {
              stdin: "",
              stdout: "Ava\n",
              match: "exact",
              files: [
                {
                  path: "note.txt",
                  content: "",
                  readOnly: false,
                },
              ],
            },
          ],
        },
        workspaceExpectations: {
          requiredFiles: [
            "note.txt",
          ],
        },
      }),
    ).toBe(false);
  });

  it("accepts the learner-safe projected starter workspace", () => {
    expect(
      isProjectedStudentEmbeddedPythonTryIt({
        id: "try-dictionary-basics-sketch0",
        exerciseKey: "try-dictionary-basics-sketch0",
        kind: "code_input",
        topic: "dictionary-basics",
        difficulty: "easy",
        title: "Try dictionaries",
        prompt: "Create and read a dictionary.",
        payload: {
          language: "python",
          starterFiles: [
            { path: "main.py", content: "profile = {}\n" },
          ],
          workspace: {
            entryFilePath: "main.py",
            starterFiles: [
              { path: "main.py", content: "profile = {}\n" },
            ],
          },
        },
      }),
    ).toBe(true);
    expect(
      isProjectedStudentEmbeddedPythonTryIt({
        id: "try-reading-file",
        exerciseKey:
          "try-reading-file",
        kind: "code_input",
        topic: "reading-files",
        difficulty: "easy",
        title: "Read a file",
        prompt:
          "Read names.csv.",
        payload: {
          language: "python",
          starterFiles: [
            {
              path: "main.py",
              content:
                "print('todo')\n",
              language: "python",
            },
            {
              path:
                "data/names.csv",
              content:
                "name\nAva\n",
              language: "csv",
            },
          ],
          workspace: {
            entryFilePath:
              "main.py",
            starterFiles: [
              {
                path: "main.py",
                content:
                  "print('todo')\n",
                language: "python",
              },
              {
                path:
                  "data/names.csv",
                content:
                  "name\nAva\n",
                language: "csv",
              },
            ],
          },
        },
      }),
    ).toBe(true);
  });
});
