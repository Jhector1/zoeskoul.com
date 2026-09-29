import {
    mergeToolPresentationPolicies,
    normalizeToolPresentationPolicy,
    type ToolPresentationPolicy,
} from "@zoeskoul/curriculum-contracts";
import type { ReviewCard, ReviewTopicShape } from "@zoeskoul/curriculum-contracts/subjects/types";

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
     * Automatic Tools visibility belongs to an actual workspace exercise,
     * not merely to an interactive Try It card.
     *
     * In the current runtime, workspace exercise detection is code-input
     * specific. Non-workspace Try It kinds such as choices, reorder, text,
     * listen, voice, and word-bank activities keep Tools manually available
     * but must not open the right rail automatically.
     *
     * Registry detection still matters on the first render, before runtime
     * exercise state has hydrated.
     */
    const isExerciseBound = Boolean(
        args.hasWorkspaceExercise ||
        args.hasRegistryWorkspaceExercise,
    );

    const isNonWorkspaceEmbeddedTryIt =
        args.cardHasEmbeddedTryIt &&
        !isExerciseBound;

    /**
     * Quiz ownership is intentionally stricter than inherited topic policy.
     *
     * A pure conceptual/choice/reorder quiz should not auto-open a reusable
     * workspace merely because its topic inherited `defaultVisible: true`.
     * The learner may still open Tools manually when `allowOpen` permits it.
     *
     * A quiz may still opt in explicitly at card/exercise scope, and a quiz
     * genuinely bound to a workspace exercise opens by default.
     */
    const quizScopedDefaultVisible =
        authoredBoolean(args.exerciseTools, "defaultVisible") ??
        authoredBoolean(args.activeCard?.tools, "defaultVisible");

    const inferredDefaultVisible = isQuizCard
        ? quizScopedDefaultVisible ?? isExerciseBound
        : authoredDefaultVisible ?? isExerciseBound;

    /**
     * Non-workspace embedded Try It is learner-opt-in.
     *
     * Even an inherited topic/card defaultVisible=true must not automatically
     * expose the right rail. The Tools button remains available through
     * allowOpen, so the learner can open Notes/Tools explicitly.
     */
    const defaultVisible = isNonWorkspaceEmbeddedTryIt
        ? false
        : inferredDefaultVisible;

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
export function shouldShowMobileCodeWorkspaceTabs(args: {
    toolsAvailable: boolean;
    showDesktopRight: boolean;
    hasRouteWorkspaceExercise: boolean;
    hasActiveCardWorkspaceExercise: boolean;
    hasActiveCardRegistryExercise: boolean;
}) {
    if (!args.toolsAvailable || args.showDesktopRight) return false;

    return Boolean(
        args.hasRouteWorkspaceExercise ||
        args.hasActiveCardWorkspaceExercise ||
        args.hasActiveCardRegistryExercise
    );
}

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
