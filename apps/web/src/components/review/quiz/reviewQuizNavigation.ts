export type ReviewQuizRestoreIndexArgs = {
    questionCount: number;
    routeExerciseIndex?: number | null;
    isCompleted: boolean;
    firstIncompleteUnlockedIndex: number;
    lastUnlockedIndex: number;
};

/**
 * Resolve the question shown when a quiz card mounts.
 *
 * A completed quiz is a reviewable nested flow, not a single terminal card.
 * Entering it through the card/topic navigation must therefore start at the
 * first question so the unified Previous/Next footer can walk the learner
 * through every question before exposing the next card/topic destination.
 *
 * An explicit exercise route always wins because that URL owns the nested
 * question selection. In an unfinished quiz we keep the old resume behavior:
 * the first incomplete unlocked question, then the last unlocked question.
 */
export function resolveReviewQuizRestoreIndex({
    questionCount,
    routeExerciseIndex = -1,
    isCompleted,
    firstIncompleteUnlockedIndex,
    lastUnlockedIndex,
}: ReviewQuizRestoreIndexArgs): number {
    if (questionCount <= 0) return 0;

    if (
        typeof routeExerciseIndex === "number" &&
        Number.isInteger(routeExerciseIndex) &&
        routeExerciseIndex >= 0 &&
        routeExerciseIndex < questionCount
    ) {
        return routeExerciseIndex;
    }

    if (isCompleted) return 0;

    if (
        Number.isInteger(firstIncompleteUnlockedIndex) &&
        firstIncompleteUnlockedIndex >= 0 &&
        firstIncompleteUnlockedIndex < questionCount
    ) {
        return firstIncompleteUnlockedIndex;
    }

    if (
        Number.isInteger(lastUnlockedIndex) &&
        lastUnlockedIndex >= 0 &&
        lastUnlockedIndex < questionCount
    ) {
        return lastUnlockedIndex;
    }

    return 0;
}
