import type { TopicAuthoringDraft } from "@zoeskoul/curriculum-contracts";

function normalizeComparable(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[`"'.,;:!?()[\]{}]/g, "")
        .replace(/\s+/g, " ");
}

function containsAnswerText(text: string, answers: string[]): boolean {
    const normalizedText = normalizeComparable(text);
    if (!normalizedText) return false;

    return answers.some((answer) => {
        const normalizedAnswer = normalizeComparable(answer);
        return normalizedAnswer && normalizedText.includes(normalizedAnswer);
    });
}

function sanitizeText(text: string, answers: string[], fallback: string): string {
    return containsAnswerText(text, answers) ? fallback : text;
}

function safeChoiceHelp() {
    return {
        hint: "Focus on the concept being tested.",
        help: {
            concept: "Think about the idea the question is checking, not the exact answer wording.",
            hint_1: "Eliminate options that do not match the concept being tested.",
            hint_2: "Choose the option or options that best fit the task described.",
        },
    };
}

function safeFillBlankHelp() {
    return {
        hint: "Focus on the missing concept rather than the exact missing term.",
        help: {
            concept: "The blank should be completed with the term that fits the job being described.",
            hint_1: "Think about what the missing part needs to do in the statement.",
            hint_2: "Choose the term that best completes the meaning of the statement.",
        },
    };
}

function safeDragHelp() {
    return {
        hint: "Focus on the logical order of the parts.",
        help: {
            concept: "Arrange the pieces according to the structure of the statement.",
            hint_1: "Think about which part must come first.",
            hint_2: "Put the pieces in the order that makes the statement valid.",
        },
    };
}

function safeCodeHelp() {
    return {
        hint: "Focus on the programming task being asked for, not the final solution text.",
        help: {
            concept: "Build the solution from the behavior the exercise is testing.",
            hint_1: "Think about which steps, functions, or statements are needed.",
            hint_2: "Construct the solution from the result the prompt asks for.",
        },
    };
}

function canonicalChoiceAnswers(exercise: any): string[] {
    if (exercise.kind === "single_choice" || exercise.kind === "multi_choice") {
        const options = Array.isArray(exercise.options) ? exercise.options : [];
        const ids = Array.isArray(exercise.correctOptionIds) ? exercise.correctOptionIds : [];
        const canonicalIds = options.map((_: unknown, index: number) =>
            String.fromCharCode(97 + index),
        );

        return ids
            .map((id: string) => {
                const index = canonicalIds.indexOf(id);
                return index >= 0 ? String(options[index]) : "";
            })
            .filter(Boolean);
    }

    if (exercise.kind === "fill_blank_choice") {
        return typeof exercise.correctValue === "string" && exercise.correctValue.trim()
            ? [exercise.correctValue]
            : [];
    }

    if (exercise.kind === "drag_reorder") {
        return Array.isArray(exercise.correctOrder) ? exercise.correctOrder.map(String) : [];
    }

    if (exercise.kind === "code_input") {
        const solution = typeof exercise.solutionCode === "string" ? exercise.solutionCode : "";
        return solution
            .split(/\s+/)
            .map((x: string) => x.trim())
            .filter((x:any) => x.length >= 4)
            .slice(0, 20);
    }

    return [];
}

export function sanitizeHintLeaksInDraft(
    draft: TopicAuthoringDraft,
): TopicAuthoringDraft {
    return {
        ...draft,
        quizDraft: draft.quizDraft.map((exercise) => {
            const answers = canonicalChoiceAnswers(exercise);

            if (answers.length === 0) return exercise;

            const fallback =
                exercise.kind === "fill_blank_choice"
                    ? safeFillBlankHelp()
                    : exercise.kind === "drag_reorder"
                        ? safeDragHelp()
                        : exercise.kind === "code_input"
                            ? safeCodeHelp()
                            : safeChoiceHelp();

            return {
                ...exercise,
                hint: sanitizeText(exercise.hint, answers, fallback.hint),
                help: {
                    concept: sanitizeText(
                        exercise.help.concept,
                        answers,
                        fallback.help.concept,
                    ),
                    hint_1: sanitizeText(
                        exercise.help.hint_1,
                        answers,
                        fallback.help.hint_1,
                    ),
                    hint_2: sanitizeText(
                        exercise.help.hint_2,
                        answers,
                        fallback.help.hint_2,
                    ),
                },
            };
        }),
    };
}
