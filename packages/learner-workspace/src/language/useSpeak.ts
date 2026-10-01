"use client";

import {
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";

import type { SpeakOpts } from "./speechTypes";

import {
    normalizeLanguageNarrationSequence,
    prepareLanguageNarration,
    type LanguageNarrationSequenceItem,
} from "./languageAudioPreparation";

import {
    claimLanguageAudioSession,
    createLanguageAudioSessionOwner,
    releaseLanguageAudioSession,
} from "./languageAudioSession";

type PendingCompletion = {
    sessionId: number;
    resolve: (completed: boolean) => void;
};

export function useSpeak() {
    const audioRef =
        useRef<HTMLAudioElement | null>(null);

    const urlRef =
        useRef<string | null>(null);

    const abortRef =
        useRef<AbortController | null>(null);

    const pendingRef =
        useRef<PendingCompletion | null>(null);

    const sessionRef =
        useRef(0);

    const ownerRef =
        useRef(
            createLanguageAudioSessionOwner(),
        );

    const [ttsStatus, setTtsStatus] =
        useState<string | null>(null);

    const [isPreparing, setIsPreparing] =
        useState(false);

    const [isSpeaking, setIsSpeaking] =
        useState(false);

    const [error, setError] =
        useState<string | null>(null);

    const revokeCurrentUrl = useCallback(() => {
        if (!urlRef.current) return;

        try {
            URL.revokeObjectURL(urlRef.current);
        } catch {
            // Best-effort media cleanup.
        }

        urlRef.current = null;
    }, []);

    const settlePending = useCallback(
        (completed: boolean) => {
            const pending = pendingRef.current;
            pendingRef.current = null;

            if (pending) {
                pending.resolve(completed);
            }
        },
        [],
    );

    const stop = useCallback(() => {
        releaseLanguageAudioSession(
            ownerRef.current,
        );

        sessionRef.current += 1;

        abortRef.current?.abort();
        abortRef.current = null;

        const audio = audioRef.current;

        if (audio) {
            audio.onended = null;
            audio.onerror = null;

            try {
                audio.pause();
                audio.currentTime = 0;
            } catch {
                // Best-effort media cleanup.
            }
        }

        settlePending(false);
        revokeCurrentUrl();

        setIsPreparing(false);
        setIsSpeaking(false);
        setTtsStatus(null);
        setError(null);
    }, [
        revokeCurrentUrl,
        settlePending,
    ]);

    const startSpeech = useCallback(
        async (
            text: string,
            opts: SpeakOpts,
            waitUntilEnded: boolean,
        ): Promise<boolean> => {
            const clean =
                String(text ?? "").trim();

            if (!clean) return false;

            stop();

            claimLanguageAudioSession(
                ownerRef.current,
                stop,
            );

            const sessionId =
                sessionRef.current;

            const controller =
                new AbortController();

            abortRef.current =
                controller;

            setError(null);
            setIsPreparing(true);
            setIsSpeaking(false);
            setTtsStatus(null);

            try {
                const response = await fetch(
                    "/api/speech/speak",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type":
                                "application/json",
                        },
                        signal:
                            controller.signal,
                        body: JSON.stringify({
                            text: clean,
                            ...(opts.locale
                                ? {
                                    locale:
                                        opts.locale,
                                }
                                : {}),
                            ...(opts.voice
                                ? {
                                    voice:
                                        opts.voice,
                                }
                                : {}),
                            format:
                                opts.format ??
                                "mp3",
                            ...(typeof opts.speed ===
                            "number"
                                ? {
                                    speed:
                                        opts.speed,
                                }
                                : {}),
                            ...(opts.instructions
                                ? {
                                    instructions:
                                        opts.instructions,
                                }
                                : {}),
                        }),
                    },
                );

                if (!response.ok) {
                    const detail =
                        await response
                            .json()
                            .catch(
                                () => null,
                            );

                    throw new Error(
                        detail?.message ??
                            detail?.error ??
                            "TTS failed",
                    );
                }

                if (
                    sessionId !==
                    sessionRef.current
                ) {
                    return false;
                }

                const contentType =
                    response.headers.get(
                        "Content-Type",
                    ) || "audio/mpeg";

                const buffer =
                    await response.arrayBuffer();

                if (
                    sessionId !==
                    sessionRef.current
                ) {
                    return false;
                }

                const blob =
                    new Blob(
                        [buffer],
                        {
                            type:
                                contentType,
                        },
                    );

                const url =
                    URL.createObjectURL(
                        blob,
                    );

                revokeCurrentUrl();
                urlRef.current = url;

                const audio =
                    audioRef.current ??
                    new Audio();

                audioRef.current = audio;

                try {
                    audio.pause();
                    audio.currentTime = 0;
                } catch {
                    // Best-effort media cleanup.
                }

                audio.src = url;

                const finish = (
                    completed: boolean,
                ) => {
                    if (
                        sessionId !==
                        sessionRef.current
                    ) {
                        return;
                    }

                    setIsPreparing(false);
                    setIsSpeaking(false);
                    setTtsStatus(null);
                    releaseLanguageAudioSession(
                        ownerRef.current,
                    );
                    revokeCurrentUrl();

                    const pending =
                        pendingRef.current;

                    if (
                        pending?.sessionId ===
                        sessionId
                    ) {
                        pendingRef.current =
                            null;
                        pending.resolve(
                            completed,
                        );
                    }
                };

                audio.onended =
                    () => finish(true);

                audio.onerror =
                    () => {
                        setError(
                            "Audio playback failed",
                        );
                        finish(false);
                    };

                let completion:
                    | Promise<boolean>
                    | null = null;

                if (waitUntilEnded) {
                    completion =
                        new Promise<boolean>(
                            (resolve) => {
                                pendingRef.current =
                                    {
                                        sessionId,
                                        resolve,
                                    };
                            },
                        );
                }

                await audio.play();

                if (
                    sessionId !==
                    sessionRef.current
                ) {
                    return false;
                }

                setIsPreparing(false);
                setIsSpeaking(true);
                setTtsStatus("Speaking…");

                if (!waitUntilEnded) {
                    // Preserve the existing
                    // useSpeak status behavior:
                    // the request/play start is
                    // complete even though audio
                    // continues playing.
                    setTtsStatus(null);
                    return true;
                }

                return await completion!;
            } catch (cause) {
                if (
                    controller.signal
                        .aborted
                ) {
                    settlePending(false);
                    return false;
                }

                const message =
                    cause instanceof Error
                        ? cause.message
                        : String(cause);

                setError(message);
                setTtsStatus(
                    `TTS: ${message}`,
                );
                setIsPreparing(false);
                setIsSpeaking(false);
                releaseLanguageAudioSession(
                    ownerRef.current,
                );
                settlePending(false);

                return false;
            } finally {
                if (
                    abortRef.current ===
                    controller
                ) {
                    abortRef.current =
                        null;
                }
            }
        },
        [
            revokeCurrentUrl,
            settlePending,
            stop,
        ],
    );

    const speak = useCallback(
        async (
            text: string,
            opts: SpeakOpts = {},
        ) => {
            await startSpeech(
                text,
                opts,
                false,
            );
        },
        [startSpeech],
    );

    const speakAndWait = useCallback(
        async (
            text: string,
            opts: SpeakOpts = {},
        ): Promise<boolean> =>
            startSpeech(
                text,
                opts,
                true,
            ),
        [startSpeech],
    );

    const prewarmSequence =
        useCallback(
            async (
                items:
                    ReadonlyArray<
                        LanguageNarrationSequenceItem
                    >,
            ): Promise<boolean> => {
                try {
                    return (
                        await prepareLanguageNarration(
                            items,
                        )
                    ) != null;
                } catch {
                    // Prewarming is speculative.
                    // Playback retries through the
                    // same preparation owner and
                    // reports any real error then.
                    return false;
                }
            },
            [],
        );

    const speakSequenceAndWait =
        useCallback(
            async (
                items:
                    ReadonlyArray<
                        LanguageNarrationSequenceItem
                    >,
            ): Promise<boolean> => {
                const queue =
                    normalizeLanguageNarrationSequence(
                        items,
                    );

                if (queue.length === 0) {
                    return false;
                }

                stop();

                claimLanguageAudioSession(
                    ownerRef.current,
                    stop,
                );

                const sessionId =
                    sessionRef.current;

                const controller =
                    new AbortController();

                abortRef.current =
                    controller;

                setError(null);
                setIsPreparing(true);
                setIsSpeaking(false);
                setTtsStatus(null);

                try {
                    /*
                     * Current-card prewarming and playback share the exact same
                     * prepared WAV Promise. A click during synthesis joins the
                     * in-flight request; a click after preparation reuses the
                     * finished ArrayBuffer without another network request.
                     */
                    const prepared =
                        await prepareLanguageNarration(
                            queue,
                        );

                    if (!prepared) {
                        return false;
                    }

                    if (
                        sessionId !==
                        sessionRef.current
                    ) {
                        return false;
                    }

                    const contentType =
                        prepared.contentType;

                    const buffer =
                        prepared.buffer;

                    const blob =
                        new Blob(
                            [buffer],
                            {
                                type:
                                    contentType,
                            },
                        );

                    revokeCurrentUrl();

                    const url =
                        URL.createObjectURL(
                            blob,
                        );

                    urlRef.current =
                        url;

                    const audio =
                        audioRef.current ??
                        new Audio();

                    audioRef.current =
                        audio;

                    try {
                        audio.pause();
                        audio.currentTime =
                            0;
                    } catch {
                        // Best-effort media cleanup.
                    }

                    audio.src = url;

                    const completion =
                        new Promise<boolean>(
                            (resolve) => {
                                pendingRef.current =
                                    {
                                        sessionId,
                                        resolve,
                                    };

                                audio.onended =
                                    () => {
                                        if (
                                            sessionId !==
                                            sessionRef.current
                                        ) {
                                            return;
                                        }

                                        settlePending(
                                            true,
                                        );
                                    };

                                audio.onerror =
                                    () => {
                                        setError(
                                            "Audio playback failed",
                                        );

                                        settlePending(
                                            false,
                                        );
                                    };
                            },
                        );

                    try {
                        await audio.play();

                        if (
                            sessionId !==
                            sessionRef.current
                        ) {
                            return false;
                        }

                        setIsPreparing(false);
                        setIsSpeaking(true);
                        setTtsStatus(
                            "Speaking…",
                        );
                    } catch (cause) {
                        const message =
                            cause instanceof Error
                                ? cause.message
                                : String(
                                      cause,
                                  );

                        setError(message);
                        settlePending(
                            false,
                        );
                    }

                    return await completion;
                } catch (cause) {
                    if (
                        controller.signal
                            .aborted
                    ) {
                        settlePending(
                            false,
                        );

                        return false;
                    }

                    const message =
                        cause instanceof Error
                            ? cause.message
                            : String(cause);

                    setError(message);
                    settlePending(
                        false,
                    );

                    return false;
                } finally {
                    if (
                        abortRef.current ===
                        controller
                    ) {
                        abortRef.current =
                            null;
                    }

                    if (
                        sessionId ===
                        sessionRef.current
                    ) {
                        setIsPreparing(
                            false,
                        );

                        setIsSpeaking(
                            false,
                        );

                        setTtsStatus(
                            null,
                        );

                        releaseLanguageAudioSession(
                            ownerRef.current,
                        );
                    }

                    const audio =
                        audioRef.current;

                    if (audio) {
                        audio.onended =
                            null;
                        audio.onerror =
                            null;
                    }

                    revokeCurrentUrl();
                }
            },
            [
                revokeCurrentUrl,
                settlePending,
                stop,
            ],
        );

    useEffect(() => {
        return () => {
            releaseLanguageAudioSession(
                ownerRef.current,
            );

            sessionRef.current += 1;

            abortRef.current?.abort();

            const audio =
                audioRef.current;

            if (audio) {
                audio.onended = null;
                audio.onerror = null;

                try {
                    audio.pause();
                } catch {
                    // Best-effort media cleanup.
                }
            }

            settlePending(false);
            revokeCurrentUrl();
        };
    }, [
        revokeCurrentUrl,
        settlePending,
    ]);

    return {
        speak,
        speakAndWait,
        prewarmSequence,
        speakSequenceAndWait,
        stop,
        ttsStatus,
        isPreparing,
        isSpeaking,
        error,
    };
}

export type {
    SpeakOpts,
} from "./speechTypes";
