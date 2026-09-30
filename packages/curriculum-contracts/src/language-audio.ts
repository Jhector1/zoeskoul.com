export type LanguageAudioKind =
    | "read_aloud"
    | "conversation";

export type LanguageAudioDelivery =
    | "neutral"
    | "warm"
    | "relaxed"
    | "formal";

export type LanguageAudioVoicePresentation =
    | "female"
    | "male";

export type LanguageAudioSpeaker = {
    /**
     * Stable semantic speaker identity inside this audio block.
     * This is deliberately not a vendor voice name.
     */
    id: string;

    /**
     * Stable voice position. Runtime maps slots to provider voices.
     * Different speakers in one conversation must use different slots.
     */
    voiceSlot: number;

    /**
     * Optional learner-facing or author-facing character label.
     * The label is never sent as part of the spoken text.
     */
    label?: string;

    /**
     * Provider-neutral requested voice presentation for this
     * participant. Curriculum authors express the learner-facing
     * intent here; provider-specific voice names remain runtime-owned.
     */
    voicePresentation?: LanguageAudioVoicePresentation;

    /**
     * Small provider-neutral delivery hint.
     */
    delivery?: LanguageAudioDelivery;
};

export type LanguageAudioSegment = {
    /**
     * Exact text sent to speech synthesis.
     *
     * Do not include speaker labels, markdown, translations,
     * lesson instructions, answers, or unrelated context.
     */
    text: string;

    /**
     * Optional per-segment BCP-47 locale override.
     *
     * This allows one teaching sketch to switch naturally
     * between instructional English and the target language.
     * When omitted, the parent audio.locale remains the fallback.
     */
    locale?: string;

    /**
     * Required for conversation audio.
     * Omitted for ordinary read-aloud audio.
     */
    speakerId?: string;

    /**
     * Optional natural pause after this segment.
     */
    pauseAfterMs?: number;
};

export type LanguageAudioSpec = {
    kind: LanguageAudioKind;

    /**
     * BCP-47-ish language/locale hint, e.g. ht-HT.
     */
    locale: string;

    /**
     * Conversation speaker definitions.
     * Vendor-specific voice names never belong here.
     */
    speakers?: LanguageAudioSpeaker[];

    /**
     * Exact independently synthesized utterances.
     */
    segments: LanguageAudioSegment[];

    /**
     * Provider-neutral playback/synthesis speed.
     */
    speed?: number;

    /**
     * Default pause between conversation turns.
     */
    defaultPauseMs?: number;
};

function nonEmpty(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

export function validateLanguageAudioSpec(
    value: unknown,
): string[] {
    const issues: string[] = [];

    if (!value || typeof value !== "object") {
        return ["audio must be an object"];
    }

    const audio = value as Partial<LanguageAudioSpec>;

    if (
        audio.kind !== "read_aloud" &&
        audio.kind !== "conversation"
    ) {
        issues.push(
            'audio.kind must be "read_aloud" or "conversation"',
        );
    }

    if (!nonEmpty(audio.locale)) {
        issues.push("audio.locale must be a non-empty string");
    }

    if (
        audio.speed != null &&
        (
            typeof audio.speed !== "number" ||
            !Number.isFinite(audio.speed) ||
            audio.speed < 0.8 ||
            audio.speed > 1.2
        )
    ) {
        issues.push(
            "audio.speed must be between 0.8 and 1.2",
        );
    }

    if (
        audio.defaultPauseMs != null &&
        (
            !Number.isInteger(audio.defaultPauseMs) ||
            audio.defaultPauseMs < 0 ||
            audio.defaultPauseMs > 2000
        )
    ) {
        issues.push(
            "audio.defaultPauseMs must be an integer from 0 to 2000",
        );
    }

    if (
        !Array.isArray(audio.segments) ||
        audio.segments.length === 0
    ) {
        issues.push(
            "audio.segments must contain at least one segment",
        );
        return issues;
    }

    audio.segments.forEach((segment, index) => {
        if (!segment || typeof segment !== "object") {
            issues.push(
                `audio.segments[${index}] must be an object`,
            );
            return;
        }

        if (!nonEmpty(segment.text)) {
            issues.push(
                `audio.segments[${index}].text must be non-empty`,
            );
        } else if (segment.text.length > 4096) {
            issues.push(
                `audio.segments[${index}].text exceeds 4096 characters`,
            );
        }

        if (
            segment.locale != null &&
            !nonEmpty(segment.locale)
        ) {
            issues.push(
                `audio.segments[${index}].locale must be a non-empty string`,
            );
        }

        if (
            segment.pauseAfterMs != null &&
            (
                !Number.isInteger(segment.pauseAfterMs) ||
                segment.pauseAfterMs < 0 ||
                segment.pauseAfterMs > 3000
            )
        ) {
            issues.push(
                `audio.segments[${index}].pauseAfterMs must be ` +
                "an integer from 0 to 3000",
            );
        }
    });

    if (audio.kind === "read_aloud") {
        if (
            audio.segments.some(
                (segment) => nonEmpty(segment.speakerId),
            )
        ) {
            issues.push(
                "read_aloud segments must not declare speakerId",
            );
        }

        return issues;
    }

    if (audio.kind === "conversation") {
        if (
            !Array.isArray(audio.speakers) ||
            audio.speakers.length < 2
        ) {
            issues.push(
                "conversation audio requires at least 2 speakers",
            );
            return issues;
        }

        if (audio.speakers.length > 8) {
            issues.push(
                "conversation audio supports at most 8 speakers",
            );
        }

        const ids = new Set<string>();
        const slots = new Set<number>();

        audio.speakers.forEach((speaker, index) => {
            if (!speaker || typeof speaker !== "object") {
                issues.push(
                    `audio.speakers[${index}] must be an object`,
                );
                return;
            }

            if (!nonEmpty(speaker.id)) {
                issues.push(
                    `audio.speakers[${index}].id must be non-empty`,
                );
            } else if (ids.has(speaker.id)) {
                issues.push(
                    `duplicate audio speaker id: ${speaker.id}`,
                );
            } else {
                ids.add(speaker.id);
            }

            if (
                !Number.isInteger(speaker.voiceSlot) ||
                speaker.voiceSlot < 1 ||
                speaker.voiceSlot > 8
            ) {
                issues.push(
                    `audio.speakers[${index}].voiceSlot must be ` +
                    "an integer from 1 to 8",
                );
            } else if (slots.has(speaker.voiceSlot)) {
                issues.push(
                    `duplicate audio voiceSlot: ${speaker.voiceSlot}`,
                );
            } else {
                slots.add(speaker.voiceSlot);
            }

            if (
                speaker.voicePresentation != null &&
                ![
                    "female",
                    "male",
                ].includes(
                    speaker.voicePresentation,
                )
            ) {
                issues.push(
                    `audio.speakers[${index}].voicePresentation is invalid`,
                );
            }

            if (
                speaker.delivery != null &&
                ![
                    "neutral",
                    "warm",
                    "relaxed",
                    "formal",
                ].includes(speaker.delivery)
            ) {
                issues.push(
                    `audio.speakers[${index}].delivery is invalid`,
                );
            }
        });

        const usedSpeakerIds = new Set<string>();

        audio.segments.forEach((segment, index) => {
            if (!nonEmpty(segment.speakerId)) {
                issues.push(
                    `conversation audio.segments[${index}] ` +
                    "requires speakerId",
                );
                return;
            }

            if (!ids.has(segment.speakerId)) {
                issues.push(
                    `audio.segments[${index}] references unknown ` +
                    `speakerId: ${segment.speakerId}`,
                );
                return;
            }

            usedSpeakerIds.add(segment.speakerId);
        });

        for (const id of ids) {
            if (!usedSpeakerIds.has(id)) {
                issues.push(
                    `conversation speaker "${id}" has no segment`,
                );
            }
        }
    }

    return issues;
}

export function assertLanguageAudioSpec(
    value: unknown,
): asserts value is LanguageAudioSpec {
    const issues = validateLanguageAudioSpec(value);

    if (issues.length > 0) {
        throw new Error(
            `Invalid LanguageAudioSpec:\n- ${issues.join("\n- ")}`,
        );
    }
}
