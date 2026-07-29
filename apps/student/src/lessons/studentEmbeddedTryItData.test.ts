import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  LearningPracticeLaunchResponse,
} from "@zoeskoul/learning-client";

import {
  readStudentPythonTryItStarter,
} from "./studentEmbeddedTryItData";

function launch(
  payload: Record<string, unknown>,
): LearningPracticeLaunchResponse {
  return {
    target: {
      version: 1,
      sectionSlug: "section-1",
      topicSlug: "topic-1",
      ownerCardId: "sketch0",
      targetKind:
        "embedded_try_it",
      targetId: "try-1",
      runtimeKind: "try_it",
    },
    title: "Try dictionaries",
    exercise: {
      id: "try-1",
      exerciseKey: "try-1",
      kind: "code_input",
      topic: "topic-1",
      difficulty: "easy",
      title: "Try dictionaries",
      prompt: "Create a dictionary.",
      payload,
    },
    key: "x".repeat(32),
    sessionId: null,
    run: null,
    validationPath:
      "/api/student/runtime/practice/validate",
  };
}

describe("student embedded Try It data", () => {
  it("reads the strict one-file Python workspace", () => {
    expect(
      readStudentPythonTryItStarter(
        launch({
          language: "python",
          starterCode:
            "print('fallback')\n",
          starterFiles: [
            {
              path: "main.py",
              content:
                "print('starter')\n",
            },
          ],
          workspace: {
            entryFilePath: "main.py",
            starterFiles: [
              {
                path: "main.py",
                content:
                  "print('workspace')\n",
              },
            ],
          },
        }),
      ),
    ).toEqual({
      language: "python",
      entry: "main.py",
      files: [
        {
          path: "main.py",
          content:
            "print('workspace')\n",
          language: "python",
        },
      ],
      editorHeight: 360,
    });
  });

  it("reads main.py plus one learner-visible companion file", () => {
    expect(
      readStudentPythonTryItStarter(
        launch({
          language: "python",
          workspace: {
            entryFilePath: "main.py",
            starterFiles: [
              {
                path: "main.py",
                content:
                  "print(open('data/names.csv').read())\n",
                language: "python",
              },
              {
                path: "data/names.csv",
                content:
                  "name\nAva\n",
                language: "csv",
              },
            ],
          },
        }),
      ),
    ).toEqual({
      language: "python",
      entry: "main.py",
      files: [
        {
          path: "main.py",
          content:
            "print(open('data/names.csv').read())\n",
          language: "python",
        },
        {
          path: "data/names.csv",
          content:
            "name\nAva\n",
          language: "csv",
        },
      ],
      editorHeight: 360,
    });
  });

  it("reads learner-visible workspace CSV data files", () => {
    expect(
      readStudentPythonTryItStarter(
        launch({
          language: "python",
          workspace: {
            entryFilePath: "main.py",
            starterFiles: [
              {
                path: "main.py",
                content:
                  "print(open('scores.csv').read())\n",
                language: "python",
              },
            ],
            files: [
              {
                path: "scores.csv",
                content:
                  "name,score\nAva,92\n",
                readOnly: false,
              },
            ],
          },
        }),
      ),
    ).toEqual({
      language: "python",
      entry: "main.py",
      files: [
        {
          path: "main.py",
          content:
            "print(open('scores.csv').read())\n",
          language: "python",
        },
        {
          path: "scores.csv",
          content:
            "name,score\nAva,92\n",
          language: "csv",
        },
      ],
      editorHeight: 360,
    });
  });

  it("reads main.py plus one nested Python helper module", () => {
    expect(
      readStudentPythonTryItStarter(
        launch({
          language: "python",
          workspace: {
            entryFilePath: "main.py",
            starterFiles: [
              {
                path: "main.py",
                content:
                  "from models.car import Car\nprint(Car())\n",
                language: "python",
              },
              {
                path: "models/car.py",
                content:
                  "class Car:\n    pass\n",
                language: "python",
              },
            ],
          },
        }),
      ),
    ).toEqual({
      language: "python",
      entry: "main.py",
      files: [
        {
          path: "main.py",
          content:
            "from models.car import Car\nprint(Car())\n",
          language: "python",
        },
        {
          path: "models/car.py",
          content:
            "class Car:\n    pass\n",
          language: "python",
        },
      ],
      editorHeight: 360,
    });
  });

  it("reads bounded semantic package workspaces and alternate entries", () => {
    expect(
      readStudentPythonTryItStarter(
        launch({
          language: "python",
          workspace: {
            entryFilePath:
              "tests/check_book.py",
            starterFiles: [
              {
                path:
                  "tests/check_book.py",
                content:
                  "from models.book import Book\n",
                language: "python",
              },
              {
                path:
                  "models/catalog_item.py",
                content:
                  "class CatalogItem:\n    pass\n",
                language: "python",
              },
              {
                path:
                  "models/book.py",
                content:
                  "class Book:\n    pass\n",
                language: "python",
              },
              {
                path:
                  "data/books.csv",
                content:
                  "title\nClean Code\n",
                language: "text",
              },
            ],
          },
        }),
      ),
    ).toEqual({
      language: "python",
      entry:
        "tests/check_book.py",
      files: [
        {
          path:
            "tests/check_book.py",
          content:
            "from models.book import Book\n",
          language: "python",
        },
        {
          path:
            "models/catalog_item.py",
          content:
            "class CatalogItem:\n    pass\n",
          language: "python",
        },
        {
          path:
            "models/book.py",
          content:
            "class Book:\n    pass\n",
          language: "python",
        },
        {
          path:
            "data/books.csv",
          content:
            "title\nClean Code\n",
          language: "csv",
        },
      ],
      editorHeight: 360,
    });
  });

  it("rejects workspaces outside the bounded package contract", () => {
    expect(
      readStudentPythonTryItStarter(
        launch({
          language: "javascript",
          starterCode:
            "console.log('x')",
        }),
      ),
    ).toBeNull();

    expect(
      readStudentPythonTryItStarter(
        launch({
          language: "python",
          workspace: {
            entryFilePath:
              "solution.py",
            starterCode:
              "print('x')",
          },
        }),
      ),
    ).toBeNull();

    expect(
      readStudentPythonTryItStarter(
        launch({
          language: "python",
          workspace: {
            entryFilePath:
              "models/missing.py",
            starterFiles: [
              {
                path: "main.py",
                content:
                  "print('x')\n",
              },
            ],
          },
        }),
      ),
    ).toBeNull();

    expect(
      readStudentPythonTryItStarter(
        launch({
          language: "python",
          workspace: {
            entryFilePath: "main.py",
            starterFiles:
              Array.from(
                { length: 10 },
                (_, index) => ({
                  path:
                    index === 0
                      ? "main.py"
                      : `models/model_${index}.py`,
                  content:
                    `VALUE_${index} = ${index}\n`,
                  language:
                    "python",
                }),
              ),
          },
        }),
      ),
    ).toBeNull();

    expect(
      readStudentPythonTryItStarter(
        launch({
          language: "python",
          workspace: {
            entryFilePath: "main.py",
            starterFiles: [
              {
                path: "main.py",
                content:
                  "print('x')\n",
              },
              {
                path: "../secret.txt",
                content:
                  "secret\n",
              },
            ],
          },
        }),
      ),
    ).toBeNull();

    expect(
      readStudentPythonTryItStarter(
        launch({
          language: "python",
          workspace: {
            entryFilePath: "main.py",
            starterFiles: [
              {
                path: "main.py",
                content:
                  "print('x')\n",
              },
              {
                path: "README.md",
                content:
                  "# Unsupported\n",
              },
            ],
          },
        }),
      ),
    ).toBeNull();

    expect(
      readStudentPythonTryItStarter(
        launch({
          language: "python",
          workspace: {
            entryFilePath: "main.py",
            starterFiles: [
              {
                path: "main.py",
                content:
                  "print('x')\n",
              },
            ],
            files: [
              {
                path: "scores.csv",
                content:
                  "name,score\nAva,92\n",
                readOnly: true,
              },
            ],
          },
        }),
      ),
    ).toBeNull();

    expect(
      readStudentPythonTryItStarter(
        launch({
          language: "python",
          workspace: {
            entryFilePath: "main.py",
            starterFiles: [
              {
                path: "main.py",
                content:
                  "print('x')\n",
              },
            ],
            files: [
              {
                path: "tools/hidden.py",
                content:
                  "VALUE = 1\n",
                readOnly: false,
              },
            ],
          },
        }),
      ),
    ).toBeNull();

    expect(
      readStudentPythonTryItStarter(
        launch({
          language: "python",
        }),
      ),
    ).toBeNull();
  });
});
