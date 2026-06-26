import type { ReviewCard } from "@/lib/subjects/types";

export function shouldDefaultCollapseToolsRailForCompactQuiz(args: {
    compactLearnerUi: boolean;
    showDebugLearningUi: boolean;
    activeCard: ReviewCard | null;
    routeTargetKind?: string | null;
    cardHasEmbeddedTryIt: boolean;
    hasWorkspaceExercise: boolean;
}) {
    if (!args.compactLearnerUi || args.showDebugLearningUi) {
        return false;
    }

    const isExerciseTarget = args.routeTargetKind === "exercise";
    if (isExerciseTarget) {
        return false;
    }

    const isProjectCard = args.activeCard?.type === "project";
    if (isProjectCard) {
        return false;
    }

    const hasEmbeddedTryItWorkspace =
        (args.activeCard?.type === "text" || args.activeCard?.type === "sketch") &&
        (args.cardHasEmbeddedTryIt || args.hasWorkspaceExercise);
    if (hasEmbeddedTryItWorkspace) {
        return false;
    }

    const cardRequiresTools = args.hasWorkspaceExercise;
    const isQuizCard = args.activeCard?.type === "quiz";

    return isQuizCard && !cardRequiresTools;
}
