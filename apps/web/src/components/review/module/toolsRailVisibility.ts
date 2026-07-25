import {
    mergeToolPresentationPolicies,
    normalizeToolPresentationPolicy,
    type ToolPresentationPolicy,
} from "@zoeskoul/curriculum-contracts";
import type { ReviewCard, ReviewTopicShape } from "@/lib/subjects/types";

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
    return normalizeToolPresentationPolicy(manifest.tools) ?? null;
}

/**
 * Published topics now materialize the fully inherited policy in meta.tools.
 * Older frozen tutoring snapshots can still carry only rawManifest.tools, so
 * keep that as a compatibility fallback until the snapshot is rebased against
 * the current source course on load.
 */
export function toolPresentationPolicyFromTopic(
    topic: ReviewTopicShape | null | undefined,
): ToolPresentationPolicy | null {
    const meta = isRecord(topic?.meta) ? topic.meta : null;
    const direct = normalizeToolPresentationPolicy(meta?.tools);
    if (direct) return direct;

    const rawManifest = isRecord(meta?.rawManifest) ? meta.rawManifest : null;
    return normalizeToolPresentationPolicy(rawManifest?.tools) ?? null;
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
    hasRegistryWorkspaceExercise?: boolean;
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

    /**
     * Default behavior is based on ownership, not merely on whether a reusable
     * editor happens to exist:
     *
     * - an exercise-owned workspace opens by default;
     * - a topic/card-owned reusable workspace stays closed by default;
     * - authored policy at subject -> module -> section -> topic -> card ->
     *   exercise scope overrides that inferred default.
     *
     * Registry detection matters on the first render, before runtime exercise
     * state has hydrated. Without it, an exercise could flash or remain closed
     * until the learner interacted with the card.
     */
    const isExerciseBound = Boolean(
        args.cardHasEmbeddedTryIt ||
        args.hasWorkspaceExercise ||
        args.hasRegistryWorkspaceExercise,
    );

    const defaultVisible = authoredDefaultVisible ?? isExerciseBound;
    const allowOpen = authoredAllowOpen ?? true;

    // Explicitly setting both fields false removes Tools entirely. Otherwise a
    // closed non-exercise workspace remains available from the Tools button.
    const isAvailable = defaultVisible || allowOpen;

    return {
        effectiveTools,
        defaultVisible,
        allowOpen,
        isAvailable,
        shouldCollapseByDefault: !defaultVisible,
        isExerciseTarget,
        isExerciseBound,
        isProjectCard,
        isQuizCard,
        inferredNeedsTools: isExerciseBound,
    };
}

/**
 * Resolve the default panel state for every learner UI mode.
 *
 * Debug UI deliberately keeps Tools open. Otherwise the effective authored
 * policy and current ownership decide the initial state. The reusable
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
    hasRegistryWorkspaceExercise?: boolean;
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
    hasRegistryWorkspaceExercise?: boolean;
}) {
    return shouldDefaultCollapseToolsRail(args);
}
