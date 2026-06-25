import type { ReviewCard } from "@/lib/subjects/types";

export function cardHasAuthoredExerciseSurface(card: ReviewCard | null | undefined) {
    if (!card) return false;

    if (card.type === "project") {
        const steps = (card.spec as { steps?: unknown[] } | null | undefined)?.steps;
        return Array.isArray(steps) && steps.length > 0;
    }

    const tryIt = (card as { tryIt?: { spec?: { steps?: unknown[] } | null } | null }).tryIt;
    return Array.isArray(tryIt?.spec?.steps) && tryIt.spec.steps.length > 0;
}

export function shouldRightRailUseBoundExercise(args: {
    routeOwnsExercise: boolean;
    activeCard: ReviewCard | null | undefined;
}) {
    if (args.routeOwnsExercise) return true;

    if (args.activeCard?.type === "quiz" || args.activeCard?.type === "project") {
        return true;
    }

    return cardHasAuthoredExerciseSurface(args.activeCard);
}
