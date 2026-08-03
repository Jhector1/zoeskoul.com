import {
    afterEach,
    describe,
    expect,
    it,
} from "vitest";

import {
    inMemoryRateLimit,
    resetInMemoryRateLimitsForTests,
} from "./inMemoryRateLimit";

afterEach(() => {
    resetInMemoryRateLimitsForTests();
});

describe("inMemoryRateLimit", () => {
    it("allows requests while capacity remains", () => {
        const first = inMemoryRateLimit(
            "student-1",
            {
                bucket: "review-progress-save",
                limit: 2,
                window: "60 s",
            },
            1_000,
        );
        const second = inMemoryRateLimit(
            "student-1",
            {
                bucket: "review-progress-save",
                limit: 2,
                window: "60 s",
            },
            2_000,
        );

        expect(first).toMatchObject({
            ok: true,
            remaining: 1,
        });
        expect(second).toMatchObject({
            ok: true,
            remaining: 0,
        });
    });

    it("blocks requests after the sliding-window limit", () => {
        const config = {
            bucket: "review-progress-save",
            limit: 2,
            window: "60 s" as const,
        };

        inMemoryRateLimit("student-1", config, 1_000);
        inMemoryRateLimit("student-1", config, 2_000);

        expect(
            inMemoryRateLimit("student-1", config, 3_000),
        ).toEqual({
            ok: false,
            limit: 2,
            remaining: 0,
            resetMs: 61_000,
        });
    });

    it("releases expired requests from the window", () => {
        const config = {
            bucket: "review-progress-save",
            limit: 1,
            window: "60 s" as const,
        };

        inMemoryRateLimit("student-1", config, 1_000);

        expect(
            inMemoryRateLimit("student-1", config, 61_001),
        ).toMatchObject({
            ok: true,
            remaining: 0,
        });
    });

    it("isolates actors and buckets", () => {
        const progressConfig = {
            bucket: "review-progress-save",
            limit: 1,
            window: "60 s" as const,
        };
        const tutoringConfig = {
            bucket: "tutoring-progress-save",
            limit: 1,
            window: "60 s" as const,
        };

        inMemoryRateLimit("student-1", progressConfig, 1_000);

        expect(
            inMemoryRateLimit("student-2", progressConfig, 2_000),
        ).toMatchObject({ ok: true });
        expect(
            inMemoryRateLimit("student-1", tutoringConfig, 2_000),
        ).toMatchObject({ ok: true });
    });
});
