import {
    describe,
    expect,
    it,
} from "vitest";

import {
    readFileSync,
} from "node:fs";

const route = readFileSync(
    "apps/web/src/app/api/speech/narrate/route.ts",
    "utf8",
);

describe(
    "language narration latency hardening",
    () => {
        it(
            "reuses Google access tokens instead of exchanging one for every card",
            () => {
                expect(route).toContain(
                    "cachedGoogleAccess",
                );

                expect(route).toContain(
                    "expiresAt",
                );

                expect(route).toContain(
                    "detail?.expires_in",
                );

                expect(route).toContain(
                    "Date.now() + 2 * 60 * 1000",
                );
            },
        );

        it(
            "uses bounded configurable synthesis concurrency",
            () => {
                expect(route).toContain(
                    "LANGUAGE_AUDIO_TTS_CONCURRENCY",
                );

                expect(route).toContain(
                    "NARRATION_SYNTHESIS_CONCURRENCY",
                );

                expect(route).toContain(
                    "Math.min(8, parsed)",
                );

                expect(route).not.toContain(
                    "mapWithConcurrency(segments, 3",
                );
            },
        );
    },
);
