import {
    mergeToolPresentationPolicies,
    type ToolPresentationPolicy,
} from "@zoeskoul/curriculum-contracts";
import type { ReviewCard } from "@/lib/subjects/types";

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Runtime exercise state intentionally stores manifest payloads as unknown
 * records because hydration can come from saved or older snapshots.
 *
 * Narrow only the optional presentation policy at the boundary where the
 * Tools resolver consumes it. Invalid/non-object values are ignored instead
 * of leaking `unknown` through the UI controller.
 */
export function toolPresentationPolicyFromManifest(
    manifest: unknown,
): ToolPresentationPolicy | null {
    if (!isRecord(manifest)) return null;

    const tools = manifest.tools;
    return isRecord(tools) ? (tools as ToolPresentationPolicy) : null;
}

function authoredBoolean(
    tools: ToolPresentationPolicy | null | undefined,
    field: "defaultVisible" | "allowOpen",
) {
    const value = tools?.[field];
    return typeof value === "boolean" ? value : null;
}

type ResolveToolsRailVisibilityArgs = {
    activeCard: ReviewCard | null;
    topicTools?: ToolPresentationPolicy | null;
    exerciseTools?: ToolPresentationPolicy | null;
    routeTargetKind?: string | null;
    routeTargetTargetKind?: string | null;
    cardHasEmbeddedTryIt: boolean;
    hasWorkspaceExercise: boolean;
};

export function resolveEffectiveToolsPolicy(args: {
    topicTools?: ToolPresentationPolicy | null;
    activeCard?: ReviewCard | null;
    exerciseTools?: ToolPresentationPolicy | null;
}) {
    return mergeToolPresentationPolicies(
        args.topicTools,
        args.activeCard?.tools,
        args.exerciseTools,
    );
}

export function resolveToolsRailVisibility(args: ResolveToolsRailVisibilityArgs) {
    const effectiveTools = resolveEffectiveToolsPolicy(args);
    const authoredDefaultVisible = authoredBoolean(
        effectiveTools,
        "defaultVisible",
    );
    const authoredAllowOpen = authoredBoolean(effectiveTools, "allowOpen");
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

    // A reading/animation card starts with the reusable workspace hidden.
    // Exercises and embedded try-its start with that same workspace visible.
    // Explicit authored policy still wins at topic, card, and exercise scope.
    const defaultVisible = authoredDefaultVisible ?? inferredNeedsTools;
    const allowOpen = authoredAllowOpen ?? true;
    const isAvailable = inferredNeedsTools || defaultVisible || allowOpen;

    return {
        effectiveTools,
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

/**
 * Resolve the default panel state for every learner UI mode.
 *
 * Debug UI deliberately keeps Tools open. Otherwise the effective authored
 * policy and current card capability decide the initial state. The reusable
 * workspace remains mounted in controller state even while the rail is hidden.
 */
export function shouldDefaultCollapseToolsRail(args: {
    showDebugLearningUi: boolean;
    activeCard: ReviewCard | null;
    topicTools?: ToolPresentationPolicy | null;
    exerciseTools?: ToolPresentationPolicy | null;
    routeTargetKind?: string | null;
    routeTargetTargetKind?: string | null;
    cardHasEmbeddedTryIt: boolean;
    hasWorkspaceExercise: boolean;
}) {
    if (args.showDebugLearningUi) return false;

    return resolveToolsRailVisibility(args).shouldCollapseByDefault;
}

/** @deprecated Use shouldDefaultCollapseToolsRail. */
export function shouldDefaultCollapseToolsRailForCompactQuiz(args: {
    compactLearnerUi: boolean;
    showDebugLearningUi: boolean;
    activeCard: ReviewCard | null;
    topicTools?: ToolPresentationPolicy | null;
    exerciseTools?: ToolPresentationPolicy | null;
    routeTargetKind?: string | null;
    routeTargetTargetKind?: string | null;
    cardHasEmbeddedTryIt: boolean;
    hasWorkspaceExercise: boolean;
}) {
    return shouldDefaultCollapseToolsRail(args);
}
