import type { ReviewCard } from "@/lib/subjects/types";

function cardToolsDefaultVisible(card: ReviewCard | null) {
    const tools = card?.tools;
    if (!tools || typeof tools !== "object") return null;

    return typeof tools.defaultVisible === "boolean"
        ? tools.defaultVisible
        : null;
}

function cardToolsAllowOpen(card: ReviewCard | null) {
    const tools = card?.tools;
    if (!tools || typeof tools !== "object") return null;

    return typeof tools.allowOpen === "boolean"
        ? tools.allowOpen
        : null;
}

type ResolveToolsRailVisibilityArgs = {
    activeCard: ReviewCard | null;
    routeTargetKind?: string | null;
    routeTargetTargetKind?: string | null;
    cardHasEmbeddedTryIt: boolean;
    hasWorkspaceExercise: boolean;
};

export function resolveToolsRailVisibility(args: ResolveToolsRailVisibilityArgs) {
    const authoredDefaultVisible = cardToolsDefaultVisible(args.activeCard);
    const authoredAllowOpen = cardToolsAllowOpen(args.activeCard);
    const isExerciseTarget =
        args.routeTargetKind === "exercise" ||
        args.routeTargetTargetKind === "exercise";
    const isProjectCard = args.activeCard?.type === "project";
    const isQuizCard = args.activeCard?.type === "quiz";
    const cardHasTryIt = Boolean(args.cardHasEmbeddedTryIt);
    const inferredNeedsTools =
        isExerciseTarget ||
        isProjectCard ||
        cardHasTryIt ||
        args.hasWorkspaceExercise;
    const defaultVisible =
        authoredDefaultVisible ??
        (isQuizCard
            ? false
            : inferredNeedsTools
                ? true
                : true);
    const allowOpen = authoredAllowOpen ?? true;
    const explicitlyHideAndDisallow =
        authoredDefaultVisible === false && authoredAllowOpen === false;
    const isAvailable = inferredNeedsTools || !explicitlyHideAndDisallow;

    return {
        defaultVisible,
        allowOpen,
        isAvailable,
        shouldCollapseByDefault: !defaultVisible,
        isExerciseTarget,
        isProjectCard,
        isQuizCard,
        inferredNeedsTools,
    };
}

export function shouldDefaultCollapseToolsRailForCompactQuiz(args: {
    compactLearnerUi: boolean;
    showDebugLearningUi: boolean;
    activeCard: ReviewCard | null;
    routeTargetKind?: string | null;
    routeTargetTargetKind?: string | null;
    cardHasEmbeddedTryIt: boolean;
    hasWorkspaceExercise: boolean;
}) {
    const visibility = resolveToolsRailVisibility(args);

    if (!args.compactLearnerUi || args.showDebugLearningUi) {
        return false;
    }

    if (visibility.isExerciseTarget) {
        return false;
    }

    if (visibility.isProjectCard) {
        return false;
    }

    if (visibility.inferredNeedsTools) {
        return false;
    }

    if (cardToolsDefaultVisible(args.activeCard) !== null) {
        return visibility.shouldCollapseByDefault;
    }

    return visibility.isQuizCard;
}
