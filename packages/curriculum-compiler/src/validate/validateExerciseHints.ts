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
            for (const answer of exercise.correctOptionIds) {
                if (texts.some((text) => containsWholeText(text, answer))) {
                    warnings.push(`Hint reveals answer in exercise ${exercise.id}`);
                    break;
                }
            }
        }

        if (exercise.kind === "fill_blank_choice") {
            if (texts.some((text) => containsWholeText(text, exercise.correctValue))) {
                warnings.push(`Hint reveals fill_blank answer in exercise ${exercise.id}`);
            }
        }
    });

    return warnings;
}