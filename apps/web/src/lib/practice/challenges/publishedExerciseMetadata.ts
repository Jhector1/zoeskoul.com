export type PublishedPracticeSectionRole =
  | "lesson"
  | "module_project"
  | "capstone";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function listLength(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

export function resolvePublishedPracticeSectionRole(
  value: unknown,
): PublishedPracticeSectionRole {
  if (value === "module_project" || value === "capstone") return value;
  return "lesson";
}

/**
 * Daily Practice should draw from independently runnable lesson try-its, not
 * from cumulative module-project/capstone steps. The authored card reference is
 * the stable signal that a code exercise was designed to stand on its own.
 */
export function collectStandaloneTryItExerciseKeys(
  topic: Record<string, unknown>,
) {
  const keys = new Set<string>();
  const cards = Array.isArray(topic.cards) ? topic.cards : [];

  for (const rawCard of cards) {
    const card = asRecord(rawCard);
    const tryIt = asRecord(card?.tryIt);
    const exerciseKey =
      typeof tryIt?.exerciseKey === "string"
        ? tryIt.exerciseKey.trim()
        : "";
    if (exerciseKey) keys.add(exerciseKey);
  }

  return keys;
}

export function resolvePublishedExerciseCapabilities(
  exercise: Record<string, unknown>,
  topic: Record<string, unknown>,
) {
  const workspace = asRecord(exercise.workspace);
  const ideConfig = asRecord(exercise.ideConfig);
  const requires = asRecord(ideConfig?.requires);
  const serviceDefaults = asRecord(topic.serviceDefaults);
  const recipe = asRecord(exercise.recipe);

  // `supportsMultiFile` means a runtime can support multiple files; it does not
  // mean every exercise in that runtime actually requires them. Count the
  // authored workspace files instead. Current bundles use starterFiles, while
  // older bundles may use files.
  const fileCount = Math.max(
    listLength(exercise.files),
    listLength(exercise.starterFiles),
    listLength(workspace?.files),
    listLength(workspace?.starterFiles),
  );

  const isMultiFile = fileCount > 1 || requires?.multiFile === true;
  const requiresTerminal =
    String(ideConfig?.runnerBackend ?? serviceDefaults?.runnerBackend ?? "") ===
      "pty" ||
    String(recipe?.type ?? "") === "shell_task" ||
    requires?.terminal === true;

  return { isMultiFile, requiresTerminal, fileCount };
}
