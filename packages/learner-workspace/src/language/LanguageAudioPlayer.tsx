"use client";

import {
    Play,
    Square,
    Volume2,
} from "lucide-react";

import {
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";

import type {
    LanguageAudioSpec,
} from "@zoeskoul/curriculum-contracts";

import {
    useAppPreferences,
} from "@zoeskoul/preferences/react";

import {
    resolveLanguageAudioTurn,
} from "./languageAudioPlayback";

import {
    buildLanguageAudioNarrationSequence,
} from "./languageAudioPreparation";

import {
    useSpeak,
} from "./useSpeak";

export type LanguageAudioPlayerLabels = {
    listen: string;
    playConversation: string;
    stop: string;
    replayLine: string;
    loading: string;
    speaking: string;
    unavailable: string;
    autoListen: string;
};

export function LanguageAudioPlayer({
    audio,
    labels,
}: {
    audio: LanguageAudioSpec;
    labels: LanguageAudioPlayerLabels;
}) {
    const speech =
        useSpeak();

    const {
        preferences,
        status: preferencesStatus,
        updatePreferences,
    } = useAppPreferences();

    // Same narration content must keep the same
    // playback identity across harmless rerenders.
    const audioIdentity =
        JSON.stringify(audio);

    const audioRef =
        useRef(audio);

    audioRef.current = audio;

    const activeAudioIdentityRef =
        useRef(audioIdentity);

    const autoStartedIdentityRef =
        useRef<string | null>(null);

    const runRef =
        useRef(0);

    const [playingAll, setPlayingAll] =
        useState(false);

    const stop =
        useCallback(() => {
            runRef.current += 1;

            speech.stop();

            setPlayingAll(false);
        }, [
            speech.stop,
        ]);

    const buildCurrentSequence =
        useCallback(
            () =>
                buildLanguageAudioNarrationSequence(
                    audioRef.current,
                ),
            [],
        );

    const playAll =
        useCallback(async () => {
            stop();

            const runId =
                runRef.current;

            const sequence =
                buildCurrentSequence();

            setPlayingAll(true);

            try {
                const completed =
                    await speech
                        .speakSequenceAndWait(
                            sequence,
                        );

                if (
                    !completed ||
                    runRef.current !==
                        runId
                ) {
                    return;
                }
            } finally {
                if (
                    runRef.current ===
                    runId
                ) {
                    setPlayingAll(
                        false,
                    );
                }
            }
        }, [
            buildCurrentSequence,
            speech.speakSequenceAndWait,
            stop,
        ]);

    // Stop only when the actual narration
    // content changes, not when React creates an
    // equivalent new audio object.
    useEffect(() => {
        if (
            activeAudioIdentityRef.current ===
            audioIdentity
        ) {
            return;
        }

        activeAudioIdentityRef.current =
            audioIdentity;

        stop();
    }, [
        audioIdentity,
        stop,
    ]);

    // CURRENT-CARD AUDIO PREWARM OWNER:
    //
    // Start preparing narration after the active
    // card reaches the browser. This never plays
    // audio and requires no autoplay permission.
    // Strict Mode / rerenders safely share the
    // module-level prepared Promise.
    useEffect(() => {
        const currentAudio =
            audioRef.current;

        if (
            !Array.isArray(
                currentAudio.segments,
            ) ||
            currentAudio.segments.length ===
                0
        ) {
            return;
        }

        const scheduledIdentity =
            audioIdentity;

        if (
            activeAudioIdentityRef.current !==
            scheduledIdentity
        ) {
            return;
        }

        void speech.prewarmSequence(
            buildCurrentSequence(),
        );
    }, [
        audioIdentity,
        buildCurrentSequence,
        speech.prewarmSequence,
    ]);

    // AUTO-LISTEN STABILITY OWNER:
    //
    // Wait for canonical preferences, then start
    // this narration identity exactly once.
    useEffect(() => {
        if (
            preferencesStatus !==
            "ready"
        ) {
            return;
        }

        if (
            !preferences
                .languageAudioAutoPlay
        ) {
            autoStartedIdentityRef.current =
                null;

            return;
        }

        if (
            !Array.isArray(
                audio.segments,
            ) ||
            audio.segments.length ===
                0
        ) {
            return;
        }

        if (
            autoStartedIdentityRef.current ===
            audioIdentity
        ) {
            return;
        }

        // Give hydration / Strict Mode one
        // brief settle window before preparing
        // the narration. Do not mark the identity
        // started until the timer actually fires;
        // otherwise a rerender can cancel the timer
        // while permanently suppressing Auto-listen.
        const scheduledIdentity =
            audioIdentity;

        const startTimer =
            window.setTimeout(
                () => {
                    if (
                        activeAudioIdentityRef.current !==
                        scheduledIdentity
                    ) {
                        return;
                    }

                    autoStartedIdentityRef.current =
                        scheduledIdentity;

                    void playAll();
                },
                150,
            );

        return () => {
            window.clearTimeout(
                startTimer,
            );
        };
    }, [
        audioIdentity,
        playAll,
        preferences
            .languageAudioAutoPlay,
        preferencesStatus,
    ]);

    const playOne =
        useCallback(
            async (index: number) => {
                const currentAudio =
                    audioRef.current;

                const segment =
                    currentAudio.segments[
                        index
                    ];

                if (!segment) {
                    return;
                }

                stop();

                const turn =
                    resolveLanguageAudioTurn(
                        currentAudio,
                        segment,
                    );

                await speech.speakAndWait(
                    turn.text,
                    turn.options,
                );
            },
            [
                speech.speakAndWait,
                stop,
            ],
        );

    useEffect(
        () => () => {
            runRef.current += 1;
            speech.stop();
        },
        [
            speech.stop,
        ],
    );

    if (
        !Array.isArray(
            audio.segments,
        ) ||
        audio.segments.length === 0
    ) {
        return null;
    }

    const busy =
        playingAll ||
        speech.isPreparing ||
        speech.isSpeaking;

    const mainLabel =
        busy
            ? labels.stop
            : audio.kind ===
                "conversation"
              ? labels.playConversation
              : labels.listen;

    return (
        <div
            className={
                "mt-3 flex flex-wrap " +
                "items-center gap-2"
            }
        >
            <button
                type="button"
                onClick={
                    busy
                        ? stop
                        : () => {
                              void playAll();
                          }
                }
                className={
                    "inline-flex items-center " +
                    "gap-1.5 rounded-md border " +
                    "border-neutral-300 " +
                    "bg-transparent px-2.5 py-1.5 " +
                    "text-xs font-medium " +
                    "text-neutral-700 " +
                    "transition-colors " +
                    "hover:bg-neutral-50 " +
                    "dark:border-neutral-700 " +
                    "dark:text-neutral-200 " +
                    "dark:hover:bg-neutral-900"
                }
            >
                {busy ? (
                    <Square
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                    />
                ) : audio.kind ===
                  "conversation" ? (
                    <Play
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                    />
                ) : (
                    <Volume2
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                    />
                )}

                {mainLabel}
            </button>

            <label
                className={
                    "inline-flex cursor-pointer " +
                    "items-center gap-1.5 " +
                    "rounded-md border " +
                    "border-neutral-300 px-2.5 py-1.5 " +
                    "text-xs font-medium " +
                    "text-neutral-700 " +
                    "dark:border-neutral-700 " +
                    "dark:text-neutral-200"
                }
            >
                <input
                    type="checkbox"
                    checked={
                        preferences
                            .languageAudioAutoPlay
                    }
                    onChange={(event) => {
                        const enabled =
                            event.currentTarget
                                .checked;

                        if (!enabled) {
                            stop();
                        }

                        void updatePreferences({
                            languageAudioAutoPlay:
                                enabled,
                        }).catch(
                            () => undefined,
                        );
                    }}
                    className="h-3.5 w-3.5"
                />
                <span>
                    {labels.autoListen}
                </span>
            </label>

            {audio.kind ===
                "conversation" &&
            audio.segments.length >
                1 ? (
                <div
                    className={
                        "flex flex-wrap " +
                        "items-center gap-1"
                    }
                >
                    {audio.segments.map(
                        (
                            segment,
                            index,
                        ) => {
                            const turn =
                                resolveLanguageAudioTurn(
                                    audio,
                                    segment,
                                );

                            const speaker =
                                turn.speakerLabel ??
                                turn.speakerId;

                            const aria =
                                `${labels.replayLine} ${index + 1}` +
                                (speaker
                                    ? ` — ${speaker}`
                                    : "");

                            return (
                                <button
                                    key={`${segment.speakerId ?? "line"}-${index}`}
                                    type="button"
                                    onClick={() => {
                                        void playOne(
                                            index,
                                        );
                                    }}
                                    aria-label={
                                        aria
                                    }
                                    title={
                                        aria
                                    }
                                    className={
                                        "inline-flex h-7 " +
                                        "min-w-7 items-center " +
                                        "justify-center gap-1 " +
                                        "rounded-md border " +
                                        "border-neutral-200 " +
                                        "px-1.5 text-[11px] " +
                                        "text-neutral-600 " +
                                        "hover:bg-neutral-50 " +
                                        "dark:border-neutral-800 " +
                                        "dark:text-neutral-300 " +
                                        "dark:hover:bg-neutral-900"
                                    }
                                >
                                    <Volume2
                                        className="h-3 w-3"
                                        aria-hidden="true"
                                    />
                                    {index +
                                        1}
                                </button>
                            );
                        },
                    )}
                </div>
            ) : null}

            <span
                aria-live="polite"
                className={
                    "text-[11px] " +
                    "text-neutral-500 " +
                    "dark:text-neutral-400"
                }
            >
                {speech.error
                    ? labels.unavailable
                    : speech.isPreparing
                      ? labels.loading
                      : speech.isSpeaking
                        ? labels.speaking
                        : ""}
            </span>
        </div>
    );
}
