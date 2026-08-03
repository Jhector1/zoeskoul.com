type UnknownRecord =
  Record<string, unknown>;

function asRecord(
  value: unknown,
): UnknownRecord | null {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function normalizedText(
  value: unknown,
) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function isResolvedLearnerText(
  value: unknown,
) {
  const text = normalizedText(value);

  return Boolean(
    text &&
    !text.startsWith("@:"),
  );
}

function collectSourceCheckMessages(
  value: unknown,
) {
  const record = asRecord(value);
  const recipe = asRecord(record?.recipe);

  const rawChecks = [
    record?.sourceChecks,
    recipe?.sourceChecks,
  ];

  const messages = new Set<string>();

  for (const raw of rawChecks) {
    if (!Array.isArray(raw)) continue;

    for (const item of raw) {
      const message = normalizedText(
        asRecord(item)?.message,
      );

      if (message) {
        messages.add(message);
      }
    }
  }

  return messages;
}

function usableCopy(
  value: unknown,
  sourceCheckMessages: Set<string>,
) {
  const text = normalizedText(value);

  return (
    isResolvedLearnerText(text) &&
    !sourceCheckMessages.has(text)
  );
}

/**
 * Runtime practice payloads carry validators, signed checks, starter files,
 * and workspace state. They must not replace the authored learner-facing
 * title or prompt.
 *
 * The published project/exercise copy is preferred when available. Runtime
 * fields such as sourceChecks remain untouched.
 */
export function preserveLearnerFacingExerciseCopy<
  T,
>(args: {
  runtimeExercise: T | null;
  authoredExercise?: T | null;
  projectManifest?: unknown;
}): T | null {
  const runtime =
    asRecord(args.runtimeExercise);
  const authored =
    asRecord(args.authoredExercise);
  const manifest =
    asRecord(args.projectManifest);

  if (!runtime) {
    return (
      args.authoredExercise ??
      (args.projectManifest as T | null) ??
      null
    );
  }

  const next: UnknownRecord = {
    ...runtime,
  };

  const sourceCheckMessages =
    collectSourceCheckMessages(runtime);

  for (const key of [
    "title",
    "prompt",
  ] as const) {
    const candidates = [
      manifest?.[key],
      authored?.[key],
      runtime[key],
    ];

    const selected = candidates.find(
      (candidate) =>
        usableCopy(
          candidate,
          sourceCheckMessages,
        ),
    );

    if (selected !== undefined) {
      next[key] = selected;
    }
  }

  return next as T;
}
