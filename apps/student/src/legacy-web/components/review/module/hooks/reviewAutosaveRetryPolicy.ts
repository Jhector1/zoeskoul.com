export const REVIEW_AUTOSAVE_RETRY_DELAYS_MS = [
    800,
    1_600,
    3_200,
    6_400,
] as const;

export function reviewProgressSaveErrorStatus(
    error: unknown,
): number {
    if (!error || typeof error !== "object") return 0;

    const status = Number(
        (error as { status?: unknown }).status ?? 0,
    );

    return Number.isFinite(status) ? status : 0;
}

export function isReviewProgressAbortError(
    error: unknown,
): boolean {
    return Boolean(
        error &&
        typeof error === "object" &&
        (error as { name?: unknown }).name === "AbortError",
    );
}

export function shouldAutoRetryReviewProgressSave(
    error: unknown,
): boolean {
    if (isReviewProgressAbortError(error)) return true;

    const status = reviewProgressSaveErrorStatus(error);

    // status 0 covers browser/network failures where no HTTP response exists.
    if (status === 0) return true;

    return [
        408,
        425,
        429,
        500,
        502,
        503,
        504,
    ].includes(status);
}

export function reviewAutosaveRetryDelayMs(
    retryIndex: number,
): number | null {
    const index = Math.max(0, Math.trunc(retryIndex));

    return (
        REVIEW_AUTOSAVE_RETRY_DELAYS_MS[index] ??
        null
    );
}

export function shouldQuarantineReviewProgressSaveFailure(
    error: unknown,
): boolean {
    const status = reviewProgressSaveErrorStatus(error);

    // The exact same request cannot heal by being resent immediately.
    // 409 is deliberately excluded because it has a dedicated merge/retry path.
    return [400, 401, 403, 413, 422].includes(status);
}
