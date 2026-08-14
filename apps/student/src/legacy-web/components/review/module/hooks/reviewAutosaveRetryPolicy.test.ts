import { describe, expect, it } from "vitest";

import {
    REVIEW_AUTOSAVE_RETRY_DELAYS_MS,
    reviewAutosaveRetryDelayMs,
    reviewProgressSaveErrorStatus,
    shouldAutoRetryReviewProgressSave,
    shouldQuarantineReviewProgressSaveFailure,
} from "./reviewAutosaveRetryPolicy";

describe("review autosave retry policy", () => {
    it("retries browser/network failures with no HTTP response", () => {
        expect(
            shouldAutoRetryReviewProgressSave(
                new TypeError("Failed to fetch"),
            ),
        ).toBe(true);
    });

    it("retries the autosave timeout AbortError", () => {
        expect(
            shouldAutoRetryReviewProgressSave(
                new DOMException("Timed out", "AbortError"),
            ),
        ).toBe(true);
    });

    it.each([408, 425, 429, 500, 502, 503, 504])(
        "retries transient HTTP status %s",
        (status) => {
            expect(
                shouldAutoRetryReviewProgressSave({ status }),
            ).toBe(true);
        },
    );

    it.each([400, 401, 403, 409, 413, 422])(
        "does not loop on permanent/conflict HTTP status %s",
        (status) => {
            expect(
                shouldAutoRetryReviewProgressSave({ status }),
            ).toBe(false);
        },
    );

    it("uses a bounded exponential retry schedule", () => {
        expect(
            REVIEW_AUTOSAVE_RETRY_DELAYS_MS,
        ).toEqual([800, 1_600, 3_200, 6_400]);
        expect(reviewAutosaveRetryDelayMs(0)).toBe(800);
        expect(reviewAutosaveRetryDelayMs(3)).toBe(6_400);
        expect(reviewAutosaveRetryDelayMs(4)).toBeNull();
    });

    it("preserves typed HTTP status inspection", () => {
        expect(
            reviewProgressSaveErrorStatus({ status: 503 }),
        ).toBe(503);
        expect(
            reviewProgressSaveErrorStatus(new Error("network")),
        ).toBe(0);
    });
});

describe("review autosave permanent failure quarantine", () => {
    it.each([400, 401, 403, 413, 422])(
        "quarantines permanent HTTP status %s",
        (status) => {
            expect(
                shouldQuarantineReviewProgressSaveFailure({
                    status,
                }),
            ).toBe(true);
        },
    );

    it.each([0, 408, 409, 425, 429, 500, 502, 503, 504])(
        "does not quarantine transient/conflict status %s",
        (status) => {
            expect(
                shouldQuarantineReviewProgressSaveFailure({
                    status,
                }),
            ).toBe(false);
        },
    );
});
