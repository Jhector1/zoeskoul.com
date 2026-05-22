import type { TopicAuthoringDraft, TopicSeed } from "@zoeskoul/curriculum-contracts";

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

function containsSqlHelpLeak(text: string): boolean {
    return /python|program output|script|terminal|\.py/i.test(text);
}

function safeChoiceHelp() {
    return {
        hint: "Read the question and connect it to the specific lesson example.",
        help: {
            concept: "This question checks a specific idea from the lesson, not general test-taking strategy.",
            hint_1: "Compare each option to the exact topic named in the question.",
            hint_2: "Remove options from unrelated Python areas, then choose the one that fits the question.",
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

function safeCodeHelp(seed?: TopicSeed) {
    const editorLabel =
        seed?.workspacePolicy?.workspace.ui.editorLabel ??
        (seed?.profileId === "sql" ? "SQL editor" : "code editor");
    const runButtonLabel =
        seed?.workspacePolicy?.workspace.ui.runButtonLabel ??
        (seed?.profileId === "sql" ? "Run query" : "Run");
    const resultsLabel =
        seed?.workspacePolicy?.workspace.ui.resultsTableLabel ??
        seed?.workspacePolicy?.workspace.ui.outputPanelLabel ??
        (seed?.profileId === "sql" ? "results table" : "output panel");

    if (seed?.profileId === "sql") {
        return {
            hint: "Use the query pattern from the lesson.",
            help: {
                concept:
                    "This SQL exercise checks whether your query returns the requested result.",
                hint_1: "Check the table name and selected columns in the SQL editor.",
                hint_2: `Click ${runButtonLabel} and compare the ${resultsLabel}.`,
            },
        };
    }

    return {
        hint: "Read the coding task and identify the required result.",
        help: {
            concept: "This coding exercise checks whether your code produces the requested result.",
            hint_1: `Use the statement or expression that fits the task in the ${editorLabel}.`,
            hint_2: `Click ${runButtonLabel} and compare the ${resultsLabel} with the expected result.`,
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
    seed?: TopicSeed,
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
                            ? safeCodeHelp(seed)
                            : safeChoiceHelp();

            const forceSqlFallback =
                exercise.kind === "code_input" &&
                seed?.profileId === "sql" &&
                [
                    exercise.hint,
                    exercise.help.concept,
                    exercise.help.hint_1,
                    exercise.help.hint_2,
                ].some((text) => containsSqlHelpLeak(String(text ?? "")));

            return {
                ...exercise,
                hint:
                    forceSqlFallback
                        ? fallback.hint
                        : sanitizeText(exercise.hint, answers, fallback.hint),
                help: {
                    concept:
                        forceSqlFallback
                            ? fallback.help.concept
                            : sanitizeText(
                                exercise.help.concept,
                                answers,
                                fallback.help.concept,
                            ),
                    hint_1:
                        forceSqlFallback
                            ? fallback.help.hint_1
                            : sanitizeText(
                                exercise.help.hint_1,
                                answers,
                                fallback.help.hint_1,
                            ),
                    hint_2:
                        forceSqlFallback
                            ? fallback.help.hint_2
                            : sanitizeText(
                                exercise.help.hint_2,
                                answers,
                                fallback.help.hint_2,
                            ),
                },
            };
        }),
    };
}
