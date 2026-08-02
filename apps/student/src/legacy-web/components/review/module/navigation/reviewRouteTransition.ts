export type ReviewRouteTransitionReadiness = {
    pendingHref: string | null;
    currentHref: string | null;
    browserHref: string | null;
    progressHydrated: boolean;
    hasExpectedExerciseSurface: boolean;
    pendingExerciseBinding: boolean;
    toolHydrated: boolean | undefined;
    exerciseReady: boolean;
    editorReady: boolean;
};

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
    if (state.pendingExerciseBinding) return false;

    if (
        state.hasExpectedExerciseSurface &&
        (
            state.toolHydrated !== true ||
            !state.exerciseReady ||
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
