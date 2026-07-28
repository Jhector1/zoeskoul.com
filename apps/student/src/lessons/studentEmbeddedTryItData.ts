import type {
  LearningPracticeLaunchResponse,
} from "@zoeskoul/learning-client";

import {
  isRecord,
} from "./studentPracticeUi";

export type StudentPythonTryItStarter = {
  language: "python";
  entry: "main.py";
  code: string;
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

function starterFileContent(
  value: unknown,
  path: string,
): string | null {
  if (!Array.isArray(value)) {
    return null;
  }

  for (const entry of value) {
    if (
      !isRecord(entry) ||
      entry.path !== path
    ) {
      continue;
    }

    const content =
      nonBlankString(entry.content);

    if (content !== null) {
      return content;
    }
  }

  return null;
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
 * Reads only the strict first-slice workspace projected by the protected
 * server boundary. Unsupported or ambiguous code exercises stay on the
 * legacy runtime instead of being guessed by the Vite client.
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

  const code =
    starterFileContent(
      workspace?.starterFiles,
      entry,
    ) ??
    starterFileContent(
      payload.starterFiles,
      entry,
    ) ??
    nonBlankString(
      workspace?.starterCode,
    ) ??
    nonBlankString(
      payload.starterCode,
    );

  if (code === null) {
    return null;
  }

  return {
    language: "python",
    entry: "main.py",
    code,
    editorHeight:
      boundedEditorHeight(
        payload.editorHeight,
      ),
  };
}
