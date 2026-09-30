import type {
    LanguageAudioSegment,
    LanguageAudioSpec,
    LanguageAudioSpeaker,
} from "@zoeskoul/curriculum-contracts";

import {
    resolveSpeechSynthesisDefaults,
} from "./resolveSpeechProfile";

import type {
    SpeakOpts,
} from "./speechTypes";

/**
 * Provider voice names live here,
 * never in curriculum JSON.
 *
 * Slots remain deterministic and can
 * be tuned globally after listening tests.
 */
export const LANGUAGE_AUDIO_VOICE_POOL =
    [
        "marin",
        "cedar",
        "coral",
        "sage",
        "nova",
        "onyx",
        "ash",
        "verse",
    ] as const;

export type LanguageAudioTurn = {
    text: string;
    speakerId: string | null;
    speakerLabel: string | null;
    options: SpeakOpts;
};

function voicePresentationInstruction(
    speaker:
        | LanguageAudioSpeaker
        | null,
): string | null {
    switch (speaker?.voicePresentation) {
        case "female":
            return (
                "Use a natural adult female voice "
                + "for this participant."
            );

        case "male":
            return (
                "Use a natural adult male voice "
                + "for this participant."
            );

        default:
            return null;
    }
}

function deliveryInstruction(
    speaker:
        | LanguageAudioSpeaker
        | null,
): string | null {
    switch (speaker?.delivery) {
        case "warm":
            return (
                "Use a warm, natural " +
                "conversational delivery."
            );

        case "relaxed":
            return (
                "Use a relaxed, natural " +
                "conversational delivery."
            );

        case "formal":
            return (
                "Use a clear, natural, " +
                "slightly formal delivery."
            );

        case "neutral":
            return (
                "Use a natural neutral " +
                "delivery."
            );

        default:
            return null;
    }
}

export function resolveConversationVoice(
    voiceSlot: number,
    primaryVoice = "marin",
): string {
    const pool = [
        primaryVoice,
        ...LANGUAGE_AUDIO_VOICE_POOL.filter(
            (voice) =>
                voice !== primaryVoice,
        ),
    ];

    const normalizedSlot =
        Number.isInteger(voiceSlot) &&
        voiceSlot >= 1
            ? voiceSlot
            : 1;

    return (
        pool[
            (normalizedSlot - 1) %
                pool.length
        ] ??
        primaryVoice
    );
}

function findSpeaker(
    audio: LanguageAudioSpec,
    segment: LanguageAudioSegment,
): LanguageAudioSpeaker | null {
    if (
        audio.kind !==
            "conversation" ||
        !segment.speakerId
    ) {
        return null;
    }

    return (
        audio.speakers?.find(
            (speaker) =>
                speaker.id ===
                segment.speakerId,
        ) ?? null
    );
}

export function resolveLanguageAudioTurn(
    audio: LanguageAudioSpec,
    segment: LanguageAudioSegment,
): LanguageAudioTurn {
    const locale =
        segment.locale ??
        audio.locale;

    const defaults =
        resolveSpeechSynthesisDefaults(
            locale,
        );

    const speaker =
        findSpeaker(
            audio,
            segment,
        );

    const voice =
        speaker
            ? resolveConversationVoice(
                  speaker.voiceSlot,
                  defaults.voice,
              )
            : defaults.voice;

    const voicePresentation =
        voicePresentationInstruction(
            speaker,
        );

    const delivery =
        deliveryInstruction(
            speaker,
        );

    const instructions = [
        defaults.instructions,
        (
            "Read only the supplied " +
            "utterance. Do not add " +
            "speaker names, commentary, " +
            "or extra words."
        ),
        voicePresentation,
        delivery,
    ]
        .filter(Boolean)
        .join(" ");

    return {
        text: segment.text,
        speakerId:
            segment.speakerId ?? null,
        speakerLabel:
            speaker?.label ?? null,
        options: {
            locale:
                locale ||
                defaults.locale ||
                undefined,
            voice,
            speed:
                audio.speed ??
                defaults.speed,
            instructions,
        },
    };
}

export function resolveLanguageAudioPauseMs(
    audio: LanguageAudioSpec,
    segment: LanguageAudioSegment,
    index: number,
): number {
    if (
        index >=
        audio.segments.length - 1
    ) {
        return 0;
    }

    if (
        segment.pauseAfterMs != null
    ) {
        return segment.pauseAfterMs;
    }

    if (
        audio.defaultPauseMs != null
    ) {
        return audio.defaultPauseMs;
    }

    return audio.kind ===
        "conversation"
        ? 320
        : 180;
}
