import type {
    LanguageAudioSpec,
} from "@zoeskoul/curriculum-contracts";

import {
    resolveLanguageAudioPauseMs,
    resolveLanguageAudioTurn,
} from "./languageAudioPlayback";

import type {
    SpeakOpts,
} from "./speechTypes";

export type LanguageNarrationSequenceItem = {
    text: string;
    opts?: SpeakOpts;
    pauseMs?: number;
};

export type PreparedLanguageNarration = {
    buffer: ArrayBuffer;
    contentType: string;
};

type PreparedEntry = {
    promise:
        Promise<PreparedLanguageNarration>;
    bytes: number;
};

const MAX_PREPARED_ENTRIES = 6;

const MAX_PREPARED_BYTES =
    24 * 1024 * 1024;

const preparedNarrationCache =
    new Map<
        string,
        PreparedEntry
    >();

let preparedBytes = 0;

export function normalizeLanguageNarrationSequence(
    items:
        ReadonlyArray<
            LanguageNarrationSequenceItem
        >,
) {
    return items
        .map((item) => ({
            text:
                String(
                    item.text ?? "",
                ).trim(),
            opts:
                item.opts ?? {},
            pauseMs:
                Math.max(
                    0,
                    Math.min(
                        5000,
                        Number(
                            item.pauseMs ??
                                0,
                        ),
                    ),
                ),
        }))
        .filter(
            (item) =>
                item.text.length > 0,
        );
}

export function buildLanguageAudioNarrationSequence(
    audio: LanguageAudioSpec,
): LanguageNarrationSequenceItem[] {
    return audio.segments.map(
        (segment, index) => {
            const turn =
                resolveLanguageAudioTurn(
                    audio,
                    segment,
                );

            return {
                text:
                    turn.text,
                opts:
                    turn.options,
                pauseMs:
                    resolveLanguageAudioPauseMs(
                        audio,
                        segment,
                        index,
                    ),
            };
        },
    );
}

/*
 * Resolve only narration that can safely be prepared before the
 * sketch renderer mounts.
 *
 * Registered archetype specs follow the exact SketchBlock merge
 * rule: registered spec first, card propsPatch second.
 *
 * Tagged narration text is deliberately not prewarmed here. The
 * normal mounted player remains the fallback after i18n resolution.
 */
export function resolveLanguageAudioFromSketchEntry(
    args: {
        entry: unknown;
        propsPatch?:
            Record<string, unknown>;
    },
): LanguageAudioSpec | null {
    const entry =
        args.entry &&
        typeof args.entry ===
            "object"
            ? args.entry as
                Record<
                    string,
                    unknown
                >
            : null;

    const patch =
        args.propsPatch;

    let spec:
        Record<string, unknown> |
        null = null;

    if (
        entry?.kind ===
            "archetype" &&
        entry.spec &&
        typeof entry.spec ===
            "object"
    ) {
        spec = {
            ...(
                entry.spec as
                    Record<
                        string,
                        unknown
                    >
            ),
            ...(patch ?? {}),
        };
    } else if (
        !entry &&
        patch &&
        typeof patch.archetype ===
            "string"
    ) {
        spec = {
            specVersion:
                typeof patch.specVersion ===
                    "number"
                    ? patch.specVersion
                    : 1,
            ...patch,
        };
    }

    const audio =
        spec?.audio;

    if (
        !audio ||
        typeof audio !==
            "object"
    ) {
        return null;
    }

    const segments =
        (
            audio as {
                segments?: unknown;
            }
        ).segments;

    if (
        !Array.isArray(
            segments,
        ) ||
        segments.length ===
            0
    ) {
        return null;
    }

    for (
        const segment of
            segments
    ) {
        if (
            !segment ||
            typeof segment !==
                "object"
        ) {
            return null;
        }

        const utterance =
            (
                segment as {
                    text?: unknown;
                }
            ).text;

        if (
            typeof utterance !==
                "string" ||
            !utterance.trim() ||
            utterance
                .trim()
                .startsWith("@:")
        ) {
            return null;
        }
    }

    return audio as
        LanguageAudioSpec;
}

export function prewarmLanguageAudioSpec(
    audio: LanguageAudioSpec,
) {
    return prepareLanguageNarration(
        buildLanguageAudioNarrationSequence(
            audio,
        ),
    );
}

export function scheduleLanguageAudioSpecPrewarm(
    audio: LanguageAudioSpec,
    delayMs = 1000,
): () => void {
    let cancelled = false;

    const timer =
        globalThis.setTimeout(
            () => {
                if (cancelled) {
                    return;
                }

                void prewarmLanguageAudioSpec(
                    audio,
                ).catch(
                    () =>
                        undefined,
                );
            },
            Math.max(
                0,
                delayMs,
            ),
        );

    return () => {
        cancelled = true;

        globalThis.clearTimeout(
            timer,
        );
    };
}

function narrationRequest(
    items:
        ReadonlyArray<
            LanguageNarrationSequenceItem
        >,
) {
    const queue =
        normalizeLanguageNarrationSequence(
            items,
        );

    if (queue.length === 0) {
        return null;
    }

    const body = {
        segments:
            queue.map(
                (item) => ({
                    text:
                        item.text,
                    locale:
                        item.opts
                            .locale,
                    voice:
                        item.opts
                            .voice,
                    speed:
                        item.opts
                            .speed,
                    instructions:
                        item.opts
                            .instructions,
                    pauseMs:
                        item.pauseMs,
                }),
            ),
    };

    const serialized =
        JSON.stringify(body);

    return {
        serialized,
    };
}

function removePrepared(
    key: string,
) {
    const entry =
        preparedNarrationCache.get(
            key,
        );

    if (!entry) {
        return;
    }

    preparedBytes -=
        entry.bytes;

    preparedNarrationCache.delete(
        key,
    );
}

function touchPrepared(
    key: string,
    entry: PreparedEntry,
) {
    preparedNarrationCache.delete(
        key,
    );

    preparedNarrationCache.set(
        key,
        entry,
    );
}

function prunePrepared() {
    while (
        preparedNarrationCache.size >
            MAX_PREPARED_ENTRIES ||
        preparedBytes >
            MAX_PREPARED_BYTES
    ) {
        const oldest =
            preparedNarrationCache
                .keys()
                .next()
                .value as
                | string
                | undefined;

        if (oldest == null) {
            break;
        }

        removePrepared(oldest);
    }
}

export async function prepareLanguageNarration(
    items:
        ReadonlyArray<
            LanguageNarrationSequenceItem
        >,
): Promise<
    PreparedLanguageNarration | null
> {
    const request =
        narrationRequest(items);

    if (!request) {
        return null;
    }

    const existing =
        preparedNarrationCache.get(
            request.serialized,
        );

    if (existing) {
        touchPrepared(
            request.serialized,
            existing,
        );

        return existing.promise;
    }

    const promise =
        fetch(
            "/api/speech/narrate",
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json",
                },
                body:
                    request.serialized,
            },
        ).then(
            async (
                response,
            ): Promise<
                PreparedLanguageNarration
            > => {
                if (!response.ok) {
                    const detail =
                        await response
                            .json()
                            .catch(
                                () =>
                                    null,
                            );

                    const message =
                        typeof detail
                            ?.message ===
                        "string"
                            ? detail
                                  .message
                            : typeof detail
                                    ?.error ===
                                "string"
                              ? detail
                                    .error
                              : "Narration TTS failed";

                    throw new Error(
                        message,
                    );
                }

                const contentType =
                    response.headers.get(
                        "Content-Type",
                    ) ||
                    "audio/wav";

                const buffer =
                    await response
                        .arrayBuffer();

                return {
                    buffer,
                    contentType,
                };
            },
        );

    const entry:
        PreparedEntry = {
            promise,
            bytes: 0,
        };

    preparedNarrationCache.set(
        request.serialized,
        entry,
    );

    prunePrepared();

    try {
        const prepared =
            await promise;

        if (
            preparedNarrationCache.get(
                request.serialized,
            ) === entry
        ) {
            entry.bytes =
                prepared.buffer
                    .byteLength;

            preparedBytes +=
                entry.bytes;

            prunePrepared();
        }

        return prepared;
    } catch (cause) {
        if (
            preparedNarrationCache.get(
                request.serialized,
            ) === entry
        ) {
            removePrepared(
                request.serialized,
            );
        }

        throw cause;
    }
}

export function resetLanguageNarrationPreparationForTests() {
    preparedNarrationCache.clear();
    preparedBytes = 0;
}
