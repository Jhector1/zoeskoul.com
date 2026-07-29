import type {
  LearningPracticeLaunchResponse,
} from "@zoeskoul/learning-client";

import {
  isRecord,
} from "./studentPracticeUi";

export type StudentPythonTryItFile = {
  path: string;
  content: string;
  language: "python" | "text" | "csv";
};

export type StudentPythonTryItStarter = {
  language: "python";
  entry: "main.py";
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
    value.length > 2
  ) {
    return null;
  }

  const paths = new Set<string>();
  const files: StudentPythonTryItFile[] = [];

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

    paths.add(path);
    files.push({
      path,
      content: valueEntry.content,
      language,
    });
  }

  const entryFile =
    files.find(
      (file) =>
        file.path === "main.py",
    );
  const companionFiles =
    files.filter(
      (file) =>
        file.path !== "main.py",
    );
  const pythonHelpers =
    companionFiles.filter(
      (file) =>
        file.language === "python",
    );

  if (
    !entryFile ||
    entryFile.language !== "python" ||
    pythonHelpers.some(
      (file) =>
        !file.path.includes("/"),
    )
  ) {
    return null;
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
 * It supports main.py plus one text/CSV companion or one nested Python helper.
 * Grading recipes and hidden test-file overrides stay server-side.
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

  if (entry !== "main.py") {
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
        : typeof workspace?.starterCode === "string"
          ? [
              {
                path: "main.py",
                content:
                  workspace.starterCode,
                language:
                  "python" as const,
              },
            ]
          : typeof payload.starterCode === "string"
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

  if (!files) return null;

  return {
    language: "python",
    entry: "main.py",
    files,
    editorHeight:
      boundedEditorHeight(
        payload.editorHeight,
      ),
  };
}
