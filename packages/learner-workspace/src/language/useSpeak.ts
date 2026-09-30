"use client";

import {
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";

import type { SpeakOpts } from "./speechTypes";

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

    const [isSpeaking, setIsSpeaking] =
        useState(false);

    const [error, setError] =
        useState<string | null>(null);

    const revokeCurrentUrl = useCallback(() => {
        if (!urlRef.current) return;

        try {
            URL.revokeObjectURL(urlRef.current);
        } catch {}

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
            } catch {}
        }

        settlePending(false);
        revokeCurrentUrl();

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
            setIsSpeaking(true);
            setTtsStatus("Speaking…");

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
                } catch {}

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

    const speakSequenceAndWait =
        useCallback(
            async (
                items: ReadonlyArray<{
                    text: string;
                    opts?: SpeakOpts;
                    pauseMs?: number;
                }>,
            ): Promise<boolean> => {
                const queue =
                    items
                        .map((item) => ({
                            text:
                                String(
                                    item.text ??
                                        "",
                                ).trim(),
                            opts:
                                item.opts ??
                                {},
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
                                item.text.length >
                                0,
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
                setTtsStatus(
                    "Speaking…",
                );

                try {
                    /*
                     * One browser request, one returned WAV, one Audio.src, one
                     * audio.play(). The server owns bilingual synthesis and
                     * authored pauses so navigation never exposes per-segment
                     * network/decode gaps to the learner.
                     */
                    const response =
                        await fetch(
                            "/api/speech/narrate",
                            {
                                method:
                                    "POST",
                                headers: {
                                    "Content-Type":
                                        "application/json",
                                },
                                signal:
                                    controller.signal,
                                body:
                                    JSON.stringify({
                                        segments:
                                            queue.map(
                                                (item) => ({
                                                    text:
                                                        item.text,
                                                    locale:
                                                        item.opts.locale,
                                                    voice:
                                                        item.opts.voice,
                                                    speed:
                                                        item.opts.speed,
                                                    instructions:
                                                        item.opts.instructions,
                                                    pauseMs:
                                                        item.pauseMs,
                                                }),
                                            ),
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
                                "Narration TTS failed",
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
                        ) || "audio/wav";

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
                    } catch {}

                    audio.src = url;

                    setIsSpeaking(true);

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
                } catch {}
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
        speakSequenceAndWait,
        stop,
        ttsStatus,
        isSpeaking,
        error,
    };
}

export type {
    SpeakOpts,
} from "./speechTypes";
