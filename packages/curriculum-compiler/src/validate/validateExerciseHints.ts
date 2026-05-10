import type { TopicAuthoringDraft } from "@zoeskoul/curriculum-contracts";

function normalize(value: string | undefined): string {
    return (value ?? "").trim().toLowerCase();
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsWholeText(haystack: string, needle: string): boolean {
    const h = normalize(haystack);
    const n = normalize(needle);
    if (!h || !n) return false;

    const pattern = new RegExp(`\\b${escapeRegExp(n)}\\b`, "i");
    return pattern.test(h);
}

function isTooGenericAnswerText(value: string): boolean {
    const normalized = normalize(value)
        .replace(/[`"'.,;:!?()[\]{}]/g, "")
        .replace(/\s+/g, " ");

    if (!normalized) return true;

    const genericKeywords = new Set([
        "and",
        "or",
        "not",
        "if",
        "elif",
        "else",
        "for",
        "in",
        "is",
        "as",
        "to",
        "of",
        "from",
        "true",
        "false",
        "yes",
        "no",
    ]);

    return genericKeywords.has(normalized);
}

function canonicalOptionIds(count: number): string[] {
    return Array.from({ length: count }, (_, i) => String.fromCharCode(97 + i));
}

export function validateExerciseHints(draft: TopicAuthoringDraft): string[] {
    const warnings: string[] = [];

    draft.quizDraft.forEach((exercise) => {
        const texts = [
            exercise.hint,
            exercise.help.concept,
            exercise.help.hint_1,
            exercise.help.hint_2,
        ];

        if (exercise.kind === "single_choice" || exercise.kind === "multi_choice") {
            const optionIds = canonicalOptionIds(exercise.options.length);

            const correctOptionTexts = exercise.correctOptionIds
                .map((id) => {
                    const index = optionIds.indexOf(id);
                    return index >= 0 ? exercise.options[index] : "";
                })
                .filter(Boolean);

            for (const answerText of correctOptionTexts) {
                if (isTooGenericAnswerText(answerText)) continue;
                if (texts.some((text) => containsWholeText(text, answerText))) {
                    warnings.push(`Hint reveals answer in exercise ${exercise.id}`);
                    break;
                }
            }
        }

        if (exercise.kind === "fill_blank_choice") {
            if (isTooGenericAnswerText(exercise.correctValue)) return;

            if (texts.some((text) => containsWholeText(text, exercise.correctValue))) {
                warnings.push(`Hint reveals fill_blank answer in exercise ${exercise.id}`);
            }
        }
    });

    return warnings;
}
