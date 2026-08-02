export type ReviewRouteTransitionReadiness = {
    pendingHref: string | null;
    currentHref: string | null;
    browserHref: string | null;
    progressHydrated: boolean;
    showSkeleton: boolean;
    saveStatus: string;
    hasExpectedExerciseSurface: boolean;
    pendingExerciseBinding: boolean;
    toolHydrated: boolean | undefined;
};

/**
 * A Review route transition is ready to reveal only after the requested
 * destination owns both React state and the address bar, progress is hydrated,
 * queued saves have settled, and any expected workspace surface is bound.
 *
 * Error/conflict are settled states. Existing save-status UI reports them;
 * the route mask must not deadlock forever.
 */
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

    if (!state.progressHydrated || state.showSkeleton) return false;

    if (
        state.saveStatus === "saving" ||
        state.saveStatus === "unsaved"
    ) {
        return false;
    }

    if (state.pendingExerciseBinding) return false;

    if (
        state.hasExpectedExerciseSurface &&
        state.toolHydrated !== true
    ) {
        return false;
    }

    return true;
}
