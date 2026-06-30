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

    if (args.activeCard?.type === "project") {
        return true;
    }

    // Plain quiz cards are usually non-code checks. Do not let the right rail
    // open a default terminal/editor before a generated exercise actually binds.
    if (args.activeCard?.type === "quiz") {
        return false;
    }

    return cardHasAuthoredExerciseSurface(args.activeCard);
}
