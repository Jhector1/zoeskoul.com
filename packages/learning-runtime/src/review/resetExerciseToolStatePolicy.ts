export type ReviewResetExerciseToolStateTarget = {
  exerciseStateKey?: string | null;
  exerciseId?: string | null;
  runtimeCardId?: string | null;
};

type ReviewQuizStateRecord = Record<string, unknown> & {
  practiceItemPatch?: Record<string, unknown>;
};

type ReviewTopicToolStateCarrier = {
  toolState?: Record<string, unknown>;
  quizState?: Record<string, ReviewQuizStateRecord>;
};

/**
 * Exercise reset is destructive across every persisted compatibility surface.
 *
 * The canonical runtime exercise is reset separately. This helper removes only
 * legacy exercise:* toolState snapshots that belong to the reset exercise so a
 * generation-0 learner workspace cannot coexist with a generation-1 starter.
 */
export function stripResetExerciseToolState<
  T extends ReviewTopicToolStateCarrier,
>(
  topicState: T,
  target: ReviewResetExerciseToolStateTarget,
): T {
  const rawStateKey = String(target.exerciseStateKey ?? "").trim();
  const exactToolKey = rawStateKey
    ? rawStateKey.startsWith("exercise:")
      ? rawStateKey
      : `exercise:${rawStateKey}`
    : "";

  const exerciseId = String(target.exerciseId ?? "").trim();
  const runtimeCardId = String(target.runtimeCardId ?? "").trim();

  const rawExerciseStateKey = rawStateKey.startsWith("exercise:")
    ? rawStateKey.slice("exercise:".length)
    : rawStateKey;

  const exactExerciseKeys = new Set(
    rawExerciseStateKey
      ? [
          rawExerciseStateKey,
          `exercise:${rawExerciseStateKey}`,
        ]
      : [],
  );

  const finalExerciseSegment = (value: unknown) => {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    const parts = raw.split(/[.:/]/).filter(Boolean);
    return parts[parts.length - 1] ?? raw;
  };

  const matchesResetExercise = (
    key: string,
    value: unknown,
    containingCardId?: string,
  ) => {
    const record =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : null;

    const valueExerciseKey = String(record?.exerciseKey ?? "").trim();
    const valueExerciseId = String(record?.exerciseId ?? "").trim();
    const valueCardId = String(record?.cardId ?? "").trim();

    if (
      exactExerciseKeys.has(key) ||
      (valueExerciseKey && exactExerciseKeys.has(valueExerciseKey)) ||
      (valueExerciseKey &&
        exactExerciseKeys.has(
          valueExerciseKey.startsWith("exercise:")
            ? valueExerciseKey
            : `exercise:${valueExerciseKey}`,
        ))
    ) {
      return true;
    }

    if (!exerciseId) return false;

    const idMatches =
      finalExerciseSegment(key) === exerciseId ||
      finalExerciseSegment(valueExerciseKey) === exerciseId ||
      finalExerciseSegment(valueExerciseId) === exerciseId;

    if (!idMatches) return false;

    return (
      !runtimeCardId ||
      containingCardId === runtimeCardId ||
      valueCardId === runtimeCardId ||
      key.includes(`:${runtimeCardId}:`) ||
      valueExerciseKey.includes(`:${runtimeCardId}:`)
    );
  };

  let changed = false;

  const nextToolState = Object.fromEntries(
    Object.entries(topicState.toolState ?? {}).filter(([key, value]) => {
      if (matchesResetExercise(key, value)) {
        changed = true;
        return false;
      }

      return true;
    }),
  );

  const nextQuizState = Object.fromEntries(
    Object.entries(topicState.quizState ?? {}).map(([cardId, rawQuizState]) => {
      const quizState =
        rawQuizState && typeof rawQuizState === "object"
          ? (rawQuizState as ReviewQuizStateRecord)
          : {};

      const practiceItemPatch = quizState.practiceItemPatch;

      if (
        !practiceItemPatch ||
        typeof practiceItemPatch !== "object"
      ) {
        return [cardId, rawQuizState];
      }

      let patchChanged = false;

      const nextPracticeItemPatch = Object.fromEntries(
        Object.entries(practiceItemPatch).filter(([key, value]) => {
          if (matchesResetExercise(key, value, cardId)) {
            patchChanged = true;
            changed = true;
            return false;
          }

          return true;
        }),
      );

      if (!patchChanged) {
        return [cardId, rawQuizState];
      }

      return [
        cardId,
        {
          ...quizState,
          practiceItemPatch: nextPracticeItemPatch,
        },
      ];
    }),
  );

  if (!changed) return topicState;

  return {
    ...topicState,
    toolState: nextToolState,
    quizState: nextQuizState,
  };
}
