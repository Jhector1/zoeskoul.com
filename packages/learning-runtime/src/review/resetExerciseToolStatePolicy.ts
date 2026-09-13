export type ReviewResetExerciseToolStateTarget = {
  exerciseStateKey?: string | null;
  exerciseId?: string | null;
  runtimeCardId?: string | null;
};

type ReviewTopicToolStateCarrier = {
  toolState?: Record<string, unknown>;
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
  const entries = Object.entries(topicState.toolState ?? {});

  if (entries.length === 0) return topicState;

  let changed = false;
  const nextToolState = Object.fromEntries(
    entries.filter(([key]) => {
      if (exactToolKey && key === exactToolKey) {
        changed = true;
        return false;
      }

      const fallbackMatches =
        !exactToolKey &&
        Boolean(exerciseId) &&
        key.startsWith("exercise:") &&
        key.endsWith(`:${exerciseId}`) &&
        (!runtimeCardId || key.includes(`:${runtimeCardId}:`));

      if (fallbackMatches) {
        changed = true;
        return false;
      }

      return true;
    }),
  );

  if (!changed) return topicState;

  return {
    ...topicState,
    toolState: nextToolState,
  };
}
