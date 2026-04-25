import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import type { AiProvider } from "@zoeskoul/curriculum-ai";

function normalizeText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function isChoiceFillBlankValid(exercise: any): boolean {
    if (exercise?.kind !== "fill_blank_choice") return true;

    const choices = Array.isArray(exercise.choices)
        ? exercise.choices.map(normalizeText).filter(Boolean)
        : [];
    const correctValue = normalizeText(exercise.correctValue);

    return choices.length >= 2 && !!correctValue && choices.includes(correctValue);
}

function isChoiceQuestionValid(exercise: any): boolean {
    if (exercise?.kind !== "single_choice" && exercise?.kind !== "multi_choice") {
        return true;
    }

    const options = Array.isArray(exercise.options)
        ? exercise.options.map(normalizeText).filter(Boolean)
        : [];
    const correctOptionIds = Array.isArray(exercise.correctOptionIds)
        ? exercise.correctOptionIds.map(normalizeText).filter(Boolean)
        : [];

    if (options.length < 2) return false;
    if (exercise.kind === "single_choice") return correctOptionIds.length === 1;
    return correctOptionIds.length >= 1;
}

function isDragReorderValid(exercise: any): boolean {
    if (exercise?.kind !== "drag_reorder") return true;

    const tokens = Array.isArray(exercise.tokens)
        ? exercise.tokens.map(normalizeText).filter(Boolean)
        : [];
    const correctOrder = Array.isArray(exercise.correctOrder)
        ? exercise.correctOrder.map(normalizeText).filter(Boolean)
        : [];

    return tokens.length >= 2 && correctOrder.length === tokens.length;
}

function isCodeInputValid(exercise: any): boolean {
    if (exercise?.kind !== "code_input") return true;

    const starterCode = normalizeText(exercise.starterCode);
    const solutionCode = normalizeText(exercise.solutionCode);
    if (!starterCode || !solutionCode) return false;

    if (exercise.recipeType === "sql_query") {
        return !!normalizeText(exercise.datasetId);
    }

    return true;
}

function needsRepair(exercise: any): boolean {
    return (
        !isChoiceFillBlankValid(exercise) ||
        !isChoiceQuestionValid(exercise) ||
        !isDragReorderValid(exercise) ||
        !isCodeInputValid(exercise)
    );
}

function applySeedDefaults(seed: TopicSeed, draft: TopicAuthoringDraft): TopicAuthoringDraft {
    return {
        ...draft,
        quizDraft: (draft.quizDraft ?? []).map((exercise) => {
            if (exercise.kind !== "code_input") return exercise;

            const datasetId =
                normalizeText(exercise.datasetId) ||
                (seed.moduleRuntimeDefaults?.kind === "sql"
                    ? normalizeText(seed.moduleRuntimeDefaults.datasetId)
                    : "");

            const recipeType =
                exercise.recipeType ||
                (seed.profileId === "sql" ? "sql_query" : undefined);

            return {
                ...exercise,
                datasetId: datasetId || undefined,
                recipeType,
            };
        }),
    };
}

export async function repairIncompleteExercises(args: {
    provider: AiProvider;
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): Promise<TopicAuthoringDraft> {
    void args.provider;

    let draft = applySeedDefaults(args.seed, args.draft);

    const repairedQuizDraft = (draft.quizDraft ?? []).map((exercise) => {
        if (exercise.kind === "fill_blank_choice") {
            const choices = Array.isArray(exercise.choices)
                ? exercise.choices.map(normalizeText).filter(Boolean)
                : [];

            const correctValue = normalizeText(exercise.correctValue);

            if (!correctValue && choices.length > 0) {
                return {
                    ...exercise,
                    choices,
                    correctValue: choices[0],
                };
            }

            return {
                ...exercise,
                choices,
                correctValue,
            };
        }

        if (exercise.kind === "single_choice" || exercise.kind === "multi_choice") {
            return {
                ...exercise,
                options: Array.isArray(exercise.options)
                    ? exercise.options.map(normalizeText).filter(Boolean)
                    : [],
                correctOptionIds: Array.isArray(exercise.correctOptionIds)
                    ? exercise.correctOptionIds.map(normalizeText).filter(Boolean)
                    : [],
            };
        }

        if (exercise.kind === "drag_reorder") {
            return {
                ...exercise,
                tokens: Array.isArray(exercise.tokens)
                    ? exercise.tokens.map(normalizeText).filter(Boolean)
                    : [],
                correctOrder: Array.isArray(exercise.correctOrder)
                    ? exercise.correctOrder.map(normalizeText).filter(Boolean)
                    : [],
            };
        }

        if (exercise.kind === "code_input") {
            const profileIsSql = String(args.seed.profileId ?? "").trim() === "sql";

            const moduleSqlDefaults =
                args.seed.moduleRuntimeDefaults?.kind === "sql"
                    ? args.seed.moduleRuntimeDefaults
                    : null;

            const rawRecipeType = normalizeText(exercise.recipeType);

            const recipeType:
                | "sql_query"
                | "template_io"
                | "fixed_tests"
                | undefined =
                rawRecipeType === "sql_query" ||
                rawRecipeType === "template_io" ||
                rawRecipeType === "fixed_tests"
                    ? rawRecipeType
                    : profileIsSql
                        ? "sql_query"
                        : undefined;

            const datasetId =
                normalizeText(exercise.datasetId) ||
                normalizeText(moduleSqlDefaults?.datasetId);

            return {
                ...exercise,
                kind: "code_input" as const,
                starterCode: normalizeText(exercise.starterCode),
                solutionCode: normalizeText(exercise.solutionCode),
                recipeType,
                datasetId: datasetId || undefined,
            };
        }

        return exercise;
    });

    draft = {
        ...draft,
        quizDraft: repairedQuizDraft,
    };

    if ((draft.quizDraft ?? []).some((exercise) => needsRepair(exercise))) {
        return applySeedDefaults(args.seed, draft);
    }

    return draft;
}