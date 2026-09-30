import {
    readFileSync,
} from "node:fs";
import {
    fileURLToPath,
} from "node:url";

import {
    describe,
    expect,
    it,
} from "vitest";

const routePath =
    fileURLToPath(
        new URL(
            "./route.ts",
            import.meta.url,
        ),
    );

const route =
    readFileSync(
        routePath,
        "utf8",
    );

describe(
    "narration quota hardening",
    () => {
        it(
            "uses bounded application caching and in-flight coalescing",
            () => {
                expect(route)
                    .toContain(
                        "createBoundedAsyncCache",
                    );

                expect(route)
                    .toContain(
                        "LANGUAGE_AUDIO_TTS_CACHE_MAX_ENTRIES",
                    );

                expect(route)
                    .toContain(
                        "LANGUAGE_AUDIO_TTS_CACHE_MAX_BYTES",
                    );

                expect(route)
                    .toContain(
                        "LANGUAGE_AUDIO_TTS_CACHE_TTL_MS",
                    );

                expect(route)
                    .toContain(
                        '"X-Zoe-TTS-Cache"',
                    );

                expect(route)
                    .toContain(
                        "cached.status",
                    );
            },
        );

        it(
            "keeps POST HTTP caching disabled but keys application cache by narration identity",
            () => {
                expect(route)
                    .toContain(
                        '"Cache-Control": "no-store"',
                    );

                expect(route)
                    .toMatch(
                        /segments:\s*args\.segments/,
                    );

                for (
                    const required
                    of [
                        "googleModel:",
                        "googleVoice:",
                        "googleRegion:",
                        "openAiModel:",
                    ]
                ) {
                    expect(route)
                        .toContain(
                            required,
                        );
                }
            },
        );

        it(
            "does not bind shared synthesis to the first browser abort signal",
            () => {
                expect(route)
                    .not.toContain(
                        "synthesizeGoogleCard(segments, req.signal)",
                    );

                expect(route)
                    .not.toContain(
                        "synthesizeOpenAiCard(segments, req.signal)",
                    );

                expect(route)
                    .toContain(
                        "LANGUAGE_AUDIO_TTS_SYNTHESIS_TIMEOUT_MS",
                    );

                expect(route)
                    .toContain(
                        "synthesisController.signal",
                    );
            },
        );
    },
);
