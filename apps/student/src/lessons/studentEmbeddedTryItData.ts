import type {
  LearningPracticeLaunchResponse,
} from "@zoeskoul/learning-client";

import {
  isRecord,
} from "./studentPracticeUi";

const MAX_EMBEDDED_PYTHON_WORKSPACE_FILES = 9;
const MAX_EMBEDDED_PYTHON_WORKSPACE_CHARACTERS =
  64 * 1024;

export type StudentPythonTryItFile = {
  path: string;
  content: string;
  language: "python" | "text" | "csv";
};

export type StudentPythonTryItStarter = {
  language: "python";
  entry: string;
  files: StudentPythonTryItFile[];
  editorHeight: number;
};

function nonBlankString(
  value: unknown,
): string | null {
  return (
    typeof value === "string" &&
    value.trim()
  )
    ? value
    : null;
}

function isSafeRelativePath(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    Boolean(value) &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    value
      .split("/")
      .every(
        (part) =>
          Boolean(part) &&
          part !== "." &&
          part !== "..",
      )
  );
}

function fileLanguage(
  path: string,
  value: unknown,
): StudentPythonTryItFile["language"] | null {
  const authored =
    typeof value === "string"
      ? value.trim()
      : "";

  if (path.endsWith(".py")) {
    return (
      !authored ||
      authored === "python"
    )
      ? "python"
      : null;
  }

  if (path.endsWith(".txt")) {
    return (
      !authored ||
      authored === "text" ||
      authored === "plaintext"
    )
      ? "text"
      : null;
  }

  if (path.endsWith(".csv")) {
    return (
      !authored ||
      authored === "csv" ||
      authored === "text" ||
      authored === "plaintext"
    )
      ? "csv"
      : null;
  }

  return null;
}

function readStarterFiles(
  value: unknown,
): StudentPythonTryItFile[] | null {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length >
      MAX_EMBEDDED_PYTHON_WORKSPACE_FILES
  ) {
    return null;
  }

  const paths = new Set<string>();
  const files: StudentPythonTryItFile[] = [];
  let totalCharacters = 0;

  for (const valueEntry of value) {
    if (!isRecord(valueEntry)) {
      return null;
    }

    const path = valueEntry.path;

    if (
      !isSafeRelativePath(path) ||
      paths.has(path) ||
      typeof valueEntry.content !== "string"
    ) {
      return null;
    }

    const language =
      fileLanguage(
        path,
        valueEntry.language,
      );

    if (!language) return null;

    totalCharacters +=
      valueEntry.content.length;

    if (
      totalCharacters >
      MAX_EMBEDDED_PYTHON_WORKSPACE_CHARACTERS
    ) {
      return null;
    }

    paths.add(path);
    files.push({
      path,
      content: valueEntry.content,
      language,
    });
  }

  return files;
}

function boundedEditorHeight(
  value: unknown,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return 360;
  }

  return Math.max(
    260,
    Math.min(
      620,
      Math.floor(value),
    ),
  );
}

/**
 * Reads the bounded Python workspace projected by the protected server.
 * It supports a bounded learner-visible Python package, including alternate
 * entry files and text/CSV companions. Grading recipes and hidden test-file
 * overrides stay server-side.
 */
export function readStudentPythonTryItStarter(
  launch: LearningPracticeLaunchResponse,
): StudentPythonTryItStarter | null {
  if (
    launch.exercise.kind !==
      "code_input"
  ) {
    return null;
  }

  const payload =
    launch.exercise.payload;
  const language =
    nonBlankString(
      payload.language ??
        payload.lang,
    );

  if (language !== "python") {
    return null;
  }

  const workspace =
    isRecord(payload.workspace)
      ? payload.workspace
      : null;
  const entry =
    nonBlankString(
      workspace?.entryFilePath,
    ) ??
    "main.py";

  if (!isSafeRelativePath(entry)) {
    return null;
  }

  const workspaceStarterFiles =
    workspace?.starterFiles;
  const payloadStarterFiles =
    payload.starterFiles;
  const files =
    workspaceStarterFiles !== undefined
      ? readStarterFiles(
          workspaceStarterFiles,
        )
      : payloadStarterFiles !== undefined
        ? readStarterFiles(
            payloadStarterFiles,
          )
        : (
            entry === "main.py" &&
            typeof workspace?.starterCode === "string"
          )
          ? [
              {
                path: "main.py",
                content:
                  workspace.starterCode,
                language:
                  "python" as const,
              },
            ]
          : (
              entry === "main.py" &&
              typeof payload.starterCode === "string"
            )
            ? [
                {
                  path: "main.py",
                  content:
                    payload.starterCode,
                  language:
                    "python" as const,
                },
              ]
            : null;

  const entryFile =
    files?.find(
      (file) =>
        file.path === entry,
    );

  if (
    !files ||
    !entryFile ||
    entryFile.language !== "python"
  ) {
    return null;
  }

  return {
    language: "python",
    entry,
    files,
    editorHeight:
      boundedEditorHeight(
        payload.editorHeight,
      ),
  };
}
