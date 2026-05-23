import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import type { AiProvider } from "@zoeskoul/curriculum-ai";
import {
    assertProfileSupportsCodeInput,
    getCurriculumProfile,
} from "@zoeskoul/curriculum-profiles";

function resolveProfile(profileId: string | undefined) {
    if (!profileId) return null;
    return getCurriculumProfile(profileId);
}

function normalizeText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}






function stripPythonComments(source: string): string {
    return source
        .split("\n")
        .map((line) => line.replace(/#.*$/, ""))
        .join("\n");
}

function normalizeCodeForCompare(source: unknown): string {
    return stripPythonComments(String(source ?? ""))
        .replace(/\s+/g, "")
        .trim();
}

function starterRevealsSolution(starterCode: unknown, solutionCode: unknown): boolean {
    const starter = normalizeCodeForCompare(starterCode);
    const solution = normalizeCodeForCompare(solutionCode);

    return !!starter && !!solution && starter === solution;
}

function defaultStarterCodeForProfile(profileId?: string): string {
    if (!profileId) {
        throw new Error(
            "Cannot create default starterCode for code_input without a curriculum profile. Pass profileId so starter defaults stay profile-owned.",
        );
    }

    return assertProfileSupportsCodeInput(
        getCurriculumProfile(profileId),
    ).defaultStarter({});
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
    const profile = resolveProfile(seed.profileId);

    return {
        ...draft,
        quizDraft: (draft.quizDraft ?? []).map((exercise) => {
            if (exercise.kind !== "code_input") return exercise;
            const codeInput = profile
                ? assertProfileSupportsCodeInput(profile)
                : null;

            const datasetId =
                normalizeText(exercise.datasetId) ||
                (seed.moduleRuntimeDefaults?.kind === "sql"
                    ? normalizeText(seed.moduleRuntimeDefaults.datasetId)
                    : "");

            const hasSemanticChecks =
                Array.isArray(exercise.semanticChecks) && exercise.semanticChecks.length > 0;

            const hasTests =
                Array.isArray(exercise.tests) && exercise.tests.length > 0;

            const recipeType =
                exercise.recipeType ||
                codeInput?.defaultRecipeType({
                    exercise,
                    seed,
                });

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
    const profile = resolveProfile(args.seed.profileId);

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
            const codeInput = profile
                ? assertProfileSupportsCodeInput(profile)
                : null;
            const repairedByProfile = codeInput?.repairDraft?.({
                exercise,
                seed: args.seed,
            });
            const repairedExercise = repairedByProfile ?? exercise;

            return {
                ...exercise,
                ...repairedExercise,
                kind: "code_input" as const,
                starterCode: starterRevealsSolution(
                    repairedExercise.starterCode,
                    repairedExercise.solutionCode,
                )
                    ? defaultStarterCodeForProfile(args.seed.profileId)
                    : normalizeText(repairedExercise.starterCode),
                solutionCode: normalizeText(repairedExercise.solutionCode),
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
