import type {
  LearningPracticeExercise,
} from "@zoeskoul/learning-contracts";

import {
  asJsonRecord,
  runtimeString,
} from "./studentRuntimePracticeDescriptorShared";

function hasNoEntries(value: unknown): boolean {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;

  const record = asJsonRecord(value);
  return record !== null && Object.keys(record).length === 0;
}

function hasNoNamedEntries(
  records: Array<Record<string, unknown> | null>,
  names: readonly string[],
): boolean {
  return records.every((record) =>
    names.every((name) =>
      hasNoEntries(record?.[name]),
    ),
  );
}

function isMainPythonStarterFile(
  value: unknown,
): boolean {
  const file = asJsonRecord(value);
  if (!file) return false;

  return (
    runtimeString(file.path) === "main.py" &&
    typeof file.content === "string" &&
    (
      file.language == null ||
      runtimeString(file.language) === "python"
    )
  );
}

function oneMainPythonStarterFile(
  value: unknown,
): boolean {
  return (
    Array.isArray(value) &&
    value.length === 1 &&
    isMainPythonStarterFile(value[0])
  );
}

/**
 * Deliberately narrow first Vite code-input slice. Source checks may remain
 * authored and server-side; only semantic-check arrays and fixtures are
 * excluded. The learner projection strips every grading field before launch.
 */
export function isEligibleStudentEmbeddedPythonTryIt(
  value: unknown,
): boolean {
  const exercise = asJsonRecord(value);
  const recipe = asJsonRecord(exercise?.recipe);
  const workspace = asJsonRecord(exercise?.workspace);

  if (
    !exercise ||
    runtimeString(exercise.kind) !== "code_input" ||
    runtimeString(exercise.purpose) !== "try_it" ||
    runtimeString(exercise.language) !== "python" ||
    runtimeString(recipe?.type) !== "fixed_tests" ||
    !oneMainPythonStarterFile(exercise.starterFiles) ||
    runtimeString(workspace?.entryFilePath) !== "main.py" ||
    !oneMainPythonStarterFile(workspace?.starterFiles)
  ) {
    return false;
  }

  const tests = recipe?.tests;
  if (!Array.isArray(tests) || tests.length !== 1) {
    return false;
  }

  const test = asJsonRecord(tests[0]);
  if (!test || runtimeString(test.stdin) !== "") {
    return false;
  }

  if (
    runtimeString(exercise.stdin) !== "" ||
    runtimeString(exercise.starterStdin) !== ""
  ) {
    return false;
  }

  return hasNoNamedEntries(
    [exercise, recipe, workspace],
    [
      "fixtureFiles",
      "fixtures",
      "fileFixtures",
      "semanticChecks",
    ],
  );
}

export function isProjectedStudentEmbeddedPythonTryIt(
  exercise: LearningPracticeExercise,
): boolean {
  if (exercise.kind !== "code_input") return false;

  const payload = exercise.payload;
  const language =
    runtimeString(payload.language) ||
    runtimeString(payload.lang);
  const workspace = asJsonRecord(payload.workspace);

  return (
    language === "python" &&
    oneMainPythonStarterFile(payload.starterFiles) &&
    runtimeString(workspace?.entryFilePath) === "main.py" &&
    oneMainPythonStarterFile(workspace?.starterFiles)
  );
}
