export type ReviewPracticeCompletionMeta = {
    attempts?: number | null;
    ok?: boolean | null;
    finalized?: boolean | null;
};

export type ReviewPracticeItemCompletionState = {
    ok?: boolean | null;
    finalized?: boolean | null;
    revealed?: boolean | null;
    revealUsed?: boolean | null;
    hasRevealAnswer?: boolean | null;
    finalizedActionConsumed?: boolean | null;
};

export type ReviewPracticeCompletionLookup = {
    meta: ReviewPracticeCompletionMeta | null;
    item: ReviewPracticeItemCompletionState | null;
    key: string | null;
};

function finiteAttempts(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function resolveItemFinalized(
    meta: ReviewPracticeCompletionMeta | null | undefined,
    item: ReviewPracticeItemCompletionState | null | undefined,
    ok: boolean | null,
) {
    return Boolean(
        ok === true ||
        meta?.finalized === true ||
        item?.finalized === true ||
        item?.revealed === true ||
        item?.revealUsed === true ||
        item?.hasRevealAnswer === true
    );
}

function normalizePracticeLookupToken(value: unknown) {
    return String(value ?? "")
        .trim()
        .replace(/_/g, "-")
        .toLowerCase();
}

function lastPracticeLookupToken(value: unknown) {
    const normalized = normalizePracticeLookupToken(value);
    if (!normalized) return "";

    const parts = normalized.split(":").filter(Boolean);
    return parts[parts.length - 1] ?? normalized;
}

function practiceKeyMatchesExercise(key: string, exerciseId: string) {
    const normalizedKey = normalizePracticeLookupToken(key);
    const normalizedExerciseId = normalizePracticeLookupToken(exerciseId);

    if (!normalizedKey || !normalizedExerciseId) return false;
    if (normalizedKey === normalizedExerciseId) return true;

    return lastPracticeLookupToken(normalizedKey) === lastPracticeLookupToken(normalizedExerciseId);
}

function practiceItemMatchesExercise(item: unknown, exerciseId: string) {
    if (!item || typeof item !== "object") return false;

    const record = item as Record<string, unknown>;
    const candidates = [
        record.exerciseKey,
        record.exerciseId,
        record.stableExerciseId,
        record.id,
    ];

    return candidates.some((candidate) =>
        practiceKeyMatchesExercise(String(candidate ?? ""), exerciseId),
    );
}

export function getReviewPracticeItemCompletionState(
    item: unknown,
): ReviewPracticeItemCompletionState | null {
    if (!item || typeof item !== "object") return null;

    const record = item as Record<string, unknown>;
    const result =
        record.result && typeof record.result === "object"
            ? (record.result as Record<string, unknown>)
            : null;

    const ok =
        typeof result?.ok === "boolean"
            ? result.ok
            : typeof record.ok === "boolean"
                ? record.ok
                : null;

    return {
        ok,
        finalized:
            result?.finalized === true ||
            record.finalized === true,
        revealed: record.revealed === true,
        revealUsed:
            result?.revealUsed === true ||
            record.revealUsed === true,
        hasRevealAnswer:
            result?.revealAnswer != null ||
            record.revealAnswer != null,
        finalizedActionConsumed:
            record.finalizedActionConsumed === true,
    };
}

/**
 * Finds a project-step completion record regardless of whether it was saved
 * under the legacy short exercise id or the newer scoped practice key.
 */
export function findReviewPracticeCompletionForExercise(args: {
    exerciseId: string;
    practiceMeta?: Record<string, ReviewPracticeCompletionMeta> | null;
    practiceItemPatch?: Record<string, unknown> | null;
}): ReviewPracticeCompletionLookup {
    const exerciseId = String(args.exerciseId ?? "").trim();
    if (!exerciseId) return { meta: null, item: null, key: null };

    const metaEntries = Object.entries(args.practiceMeta ?? {});
    const itemEntries = Object.entries(args.practiceItemPatch ?? {});

    const metaKey =
        (args.practiceMeta?.[exerciseId] ? exerciseId : null) ??
        metaEntries.find(([key]) => practiceKeyMatchesExercise(key, exerciseId))?.[0] ??
        null;

    const itemKey =
        (args.practiceItemPatch?.[exerciseId] ? exerciseId : null) ??
        itemEntries.find(([key, item]) =>
            practiceKeyMatchesExercise(key, exerciseId) ||
            practiceItemMatchesExercise(item, exerciseId),
        )?.[0] ??
        null;

    const key = metaKey ?? itemKey;
    if (!key) return { meta: null, item: null, key: null };

    return {
        meta: metaKey ? args.practiceMeta?.[metaKey] ?? null : null,
        item: itemKey
            ? getReviewPracticeItemCompletionState(
                args.practiceItemPatch?.[itemKey],
            )
            : null,
        key,
    };
}

/**
 * Resolve the completion state used by review navigation.
 *
 * Correctness and finalization are intentionally separate:
 * - `ok` controls score/credit.
 * - `finalized` controls whether the learner may move forward.
 *
 * A revealed answer is finalized with zero credit, so it must unlock review
 * navigation without being counted as correct.
 */
function hasReviewPracticeCompletionEvidence(
    meta: ReviewPracticeCompletionMeta | null | undefined,
    item: ReviewPracticeItemCompletionState | null | undefined,
) {
    return Boolean(
        finiteAttempts(meta?.attempts) > 0 ||
        typeof meta?.ok === "boolean" ||
        meta?.finalized === true ||
        typeof item?.ok === "boolean" ||
        item?.finalized === true ||
        item?.revealed === true ||
        item?.revealUsed === true ||
        item?.hasRevealAnswer === true
    );
}

export function resolveReviewPracticeCompletionStatus(args: {
    live?: ReviewPracticeCompletionMeta | null;
    saved?: ReviewPracticeCompletionMeta | null;
    liveItem?: ReviewPracticeItemCompletionState | null;
    savedItem?: ReviewPracticeItemCompletionState | null;
}) {
    /**
     * Route-owned project questions may have a temporary live loading shell
     * (`attempts: 0`, `ok: null`) while their durable result lives in saved
     * progress. An empty shell must not shadow that saved completion record.
     */
    const hasMeaningfulLiveState = hasReviewPracticeCompletionEvidence(
        args.live,
        args.liveItem,
    );
    const hasSavedState = hasReviewPracticeCompletionEvidence(
        args.saved,
        args.savedItem,
    );
    const useLiveState = hasMeaningfulLiveState || !hasSavedState;
    const meta = useLiveState ? args.live : args.saved;
    const item = useLiveState ? args.liveItem : args.savedItem;

    const attempts = finiteAttempts(meta?.attempts);
    const ok =
        typeof item?.ok === "boolean"
            ? item.ok
            : typeof meta?.ok === "boolean"
                ? meta.ok
                : null;

    const finalized = resolveItemFinalized(meta, item, ok);

    return {
        checked: attempts > 0 || finalized || typeof ok === "boolean",
        ok,
        finalized,
    };
}

/**
 * Project-step completion is navigation completion, not score completion.
 * A correct answer and a finalized reveal both count as a completed step.
 */
export function isReviewPracticeStepComplete(args: {
    meta?: ReviewPracticeCompletionMeta | null;
    item?: ReviewPracticeItemCompletionState | null;
}) {
    return resolveReviewPracticeCompletionStatus({
        saved: args.meta ?? null,
        savedItem: args.item ?? null,
    }).finalized;
}

export function isReviewFinalizedActionConsumed(item: unknown) {
    return getReviewPracticeItemCompletionState(item)?.finalizedActionConsumed === true;
}

export function buildReviewFinalizedActionConsumedPatch(consumed = true) {
    return {
        finalizedActionConsumed: consumed,
    } as const;
}

export async function flushBeforeExerciseRouteNavigation(args: {
    flush: () => void;
    navigate: () => Promise<void> | void;
}) {
    args.flush();
    await args.navigate();
}
