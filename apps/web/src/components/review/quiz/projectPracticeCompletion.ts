export type ReviewPracticeCompletionMeta = {
    attempts?: number | null;
    ok?: boolean | null;
};

export type ReviewPracticeLiveState = ReviewPracticeCompletionMeta & {
    itemResultOk?: boolean | null;
};

export function resolveReviewPracticeCompletionStatus(args: {
    live?: ReviewPracticeLiveState | null;
    saved?: ReviewPracticeCompletionMeta | null;
    savedItemResultOk?: boolean | null;
}) {
    if (args.live) {
        const attempts =
            typeof args.live.attempts === "number" &&
            Number.isFinite(args.live.attempts)
                ? args.live.attempts
                : 0;

        const ok =
            typeof args.live.itemResultOk === "boolean"
                ? args.live.itemResultOk
                : typeof args.live.ok === "boolean"
                    ? args.live.ok
                    : null;

        return {
            checked: attempts > 0,
            ok,
        };
    }

    const attempts =
        typeof args.saved?.attempts === "number" &&
        Number.isFinite(args.saved.attempts)
            ? args.saved.attempts
            : 0;

    const ok =
        typeof args.savedItemResultOk === "boolean"
            ? args.savedItemResultOk
            : typeof args.saved?.ok === "boolean"
                ? args.saved.ok
                : null;

    return {
        checked: attempts > 0 || typeof ok === "boolean",
        ok,
    };
}

export async function flushBeforeExerciseRouteNavigation(args: {
    flush: () => void;
    navigate: () => Promise<void> | void;
}) {
    args.flush();
    await args.navigate();
}
