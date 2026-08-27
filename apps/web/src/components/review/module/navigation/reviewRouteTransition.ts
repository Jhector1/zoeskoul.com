export type ReviewRouteTransitionReadiness = {
    pendingHref: string | null;
    currentHref: string | null;
    browserHref: string | null;
    progressHydrated: boolean;
    hasExpectedExerciseSurface: boolean;
    hasExpectedEditorBinding: boolean;
    pendingExerciseBinding: boolean;
    toolHydrated: boolean | undefined;
    exerciseReady: boolean;
    editorReady: boolean;
};

export function isLatestReviewNavigationGeneration(args: {
    navigationGeneration: number;
    latestNavigationGeneration: number;
    transitionNavigationGeneration?: number;
}) {
    return (
        args.navigationGeneration === args.latestNavigationGeneration &&
        (
            args.transitionNavigationGeneration === undefined ||
            args.navigationGeneration === args.transitionNavigationGeneration
        )
    );
}

export function publishReviewNavigationImmediately<TSnapshot>(args: {
    navigationGeneration: number;
    latestNavigationGeneration: number;
    snapshot: TSnapshot;
    enqueueSnapshot: (snapshot: TSnapshot) => void;
    publish: () => void;
}) {
    args.enqueueSnapshot(args.snapshot);

    if (!isLatestReviewNavigationGeneration({
        navigationGeneration: args.navigationGeneration,
        latestNavigationGeneration: args.latestNavigationGeneration,
    })) {
        return false;
    }

    args.publish();
    return true;
}

export type ReviewToolBindOwner = {
    navigationGeneration: number;
    routeIdentity: string | null;
};

export function reviewToolBindMatchesCurrentCard(args: {
    bindOwnerCardId: string;
    routeCardId: string | null | undefined;
    activeCardId: string | null | undefined;
}) {
    if (!args.bindOwnerCardId) return false;

    if (args.routeCardId) {
        return args.routeCardId === args.bindOwnerCardId;
    }

    return args.activeCardId === args.bindOwnerCardId;
}

export async function publishReviewToolBindIfCurrent(args: {
    acceptedOwner: ReviewToolBindOwner;
    getCurrentOwner: () => ReviewToolBindOwner;
    bind: () => Promise<void>;
    publish: () => void;
}) {
    await args.bind();

    const currentOwner = args.getCurrentOwner();
    if (
        currentOwner.navigationGeneration !==
            args.acceptedOwner.navigationGeneration ||
        currentOwner.routeIdentity !== args.acceptedOwner.routeIdentity
    ) {
        return false;
    }

    args.publish();
    return true;
}

export function isReviewRouteTransitionReady(
    state: ReviewRouteTransitionReadiness,
) {
    if (!state.pendingHref || !state.currentHref) return false;
    if (state.pendingHref !== state.currentHref) return false;

    if (
        state.browserHref !== null &&
        state.browserHref !== state.pendingHref
    ) {
        return false;
    }

    if (!state.progressHydrated) return false;

    /**
     * Prompt/content readiness and editor readiness are related but are not
     * the same gate. An authored destination can publish before its concrete
     * editor owner key has registered. Waiting for editor hydration in that
     * unnamed state creates a cycle: the transition waits for an editor
     * binding that the destination has not had a chance to publish yet.
     */
    /**
     * An authored exercise surface has one presentation authority. Once its
     * canonical ExerciseRuntime reports the destination ready, editor binding
     * and editor hydration proceed in parallel and cannot keep the route-level
     * animation open.
     *
     * Editor-only destinations still require the editor handshake below.
     */
    if (state.hasExpectedExerciseSurface) {
        return state.exerciseReady;
    }

    if (
        state.hasExpectedEditorBinding &&
        (
            state.pendingExerciseBinding ||
            state.toolHydrated !== true ||
            !state.editorReady
        )
    ) {
        return false;
    }

    return true;
}

export type ReviewDestinationTransitionPresentationState = {
    isTransitioning: boolean;
    destinationIdentity: string | null;
    destinationPublished: boolean;
    destinationReady: boolean;
};

export function resolveReviewDestinationTransitionPresentation(
    state: ReviewDestinationTransitionPresentationState,
) {
    const active = Boolean(
        state.isTransitioning &&
        state.destinationIdentity,
    );

    return {
        isDestinationTransitioning: active,
        showExerciseSkeleton: active,
        showEditorLoading: active,
        destinationIdentity: active
            ? state.destinationIdentity
            : null,
        destinationPublished: active && state.destinationPublished,
        destinationReady: active && state.destinationReady,
    };
}

export type ReviewRouteTransitionStartState = {
    pendingHref: string | null;
    revealedHref: string | null;
    nextHref: string | null;
    browserHref: string | null;
};

export function shouldStartReviewRouteTransition(
    state: ReviewRouteTransitionStartState,
) {
    if (!state.nextHref) return false;
    if (state.pendingHref === state.nextHref) return false;

    if (
        state.revealedHref === state.nextHref &&
        state.browserHref === state.nextHref
    ) {
        return false;
    }

    return true;
}

export type ReviewTransitionLabelState = {
    isRouteTransitioning: boolean;
    isModuleContinuePending: boolean;
    saveStatus: string;
};

export function resolveReviewTransitionLabel(
    state: ReviewTransitionLabelState,
) {
    if (
        state.isRouteTransitioning ||
        state.isModuleContinuePending
    ) {
        return "Loading...";
    }

    return state.saveStatus === "saving"
        ? "Saving progress..."
        : "Loading...";
}
