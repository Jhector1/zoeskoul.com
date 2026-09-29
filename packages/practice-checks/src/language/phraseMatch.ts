export const DEFAULT_VOICE_PHRASE_PASS_THRESHOLD = 0.6;

export type PhraseMatchResult = {
    normalizedTranscript: string;
    normalizedTarget: string;
    characterSimilarity: number;
    tokenSimilarity: number;
    score: number;
    percent: number;
    ok: boolean;
};

function clamp01(value: number) {
    return Math.max(0, Math.min(1, value));
}

function safeLower(value: string, locale?: string) {
    if (!locale) return value.toLowerCase();

    try {
        return value.toLocaleLowerCase(locale);
    } catch {
        return value.toLowerCase();
    }
}

export function normalizePhraseMatchText(
    input: unknown,
    locale?: string,
): string {
    return safeLower(
        String(input ?? "")
            .normalize("NFC")
            .replace(/[\u2018\u2019\u02BC\uFF07]/g, "'")
            .replace(/[^\p{L}\p{M}\p{N}'\s]+/gu, " ")
            .replace(/\s+/g, " ")
            .trim(),
        locale,
    );
}

function editDistance<T>(left: readonly T[], right: readonly T[]): number {
    if (!left.length) return right.length;
    if (!right.length) return left.length;

    let previous = Array.from(
        { length: right.length + 1 },
        (_, index) => index,
    );

    for (let i = 1; i <= left.length; i += 1) {
        const current = new Array<number>(right.length + 1);
        current[0] = i;

        for (let j = 1; j <= right.length; j += 1) {
            const substitutionCost =
                left[i - 1] === right[j - 1] ? 0 : 1;

            current[j] = Math.min(
                previous[j] + 1,
                current[j - 1] + 1,
                previous[j - 1] + substitutionCost,
            );
        }

        previous = current;
    }

    return previous[right.length] ?? 0;
}

function normalizedSimilarity<T>(
    left: readonly T[],
    right: readonly T[],
): number {
    const denominator = Math.max(left.length, right.length);
    if (!denominator) return 1;

    return clamp01(
        1 - editDistance(left, right) / denominator,
    );
}

export function scorePhraseMatch(args: {
    transcript: unknown;
    targetText: unknown;
    locale?: string;
    passThreshold?: number;
}): PhraseMatchResult {
    const normalizedTranscript = normalizePhraseMatchText(
        args.transcript,
        args.locale,
    );
    const normalizedTarget = normalizePhraseMatchText(
        args.targetText,
        args.locale,
    );

    const passThreshold = clamp01(
        args.passThreshold ?? DEFAULT_VOICE_PHRASE_PASS_THRESHOLD,
    );

    if (!normalizedTranscript || !normalizedTarget) {
        return {
            normalizedTranscript,
            normalizedTarget,
            characterSimilarity: 0,
            tokenSimilarity: 0,
            score: 0,
            percent: 0,
            ok: false,
        };
    }

    const transcriptChars = Array.from(normalizedTranscript);
    const targetChars = Array.from(normalizedTarget);
    const transcriptTokens = normalizedTranscript.split(" ").filter(Boolean);
    const targetTokens = normalizedTarget.split(" ").filter(Boolean);

    const characterSimilarity = normalizedSimilarity(
        transcriptChars,
        targetChars,
    );

    const tokenSimilarity = normalizedSimilarity(
        transcriptTokens,
        targetTokens,
    );

    const score =
        Math.max(transcriptTokens.length, targetTokens.length) <= 1
            ? characterSimilarity
            : clamp01(
                tokenSimilarity * 0.65 +
                characterSimilarity * 0.35,
            );

    return {
        normalizedTranscript,
        normalizedTarget,
        characterSimilarity,
        tokenSimilarity,
        score,
        percent: Math.round(score * 100),
        ok: score >= passThreshold,
    };
}
