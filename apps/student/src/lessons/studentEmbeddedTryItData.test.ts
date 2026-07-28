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
      code:
        "print('workspace')\n",
      editorHeight: 360,
    });
  });

  it("rejects exercises outside the first migrated slice", () => {
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
        }),
      ),
    ).toBeNull();
  });
});
