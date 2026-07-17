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

type CodeInputRecipeType =
    | "sql_query"
    | "fixed_tests"
    | "semantic"
    | "template_io"
    | "shell_task"
    | undefined;

type NormalizedCodeInputTest = {
    stdin?: string;
    stdout: string;
    match?: "exact" | "includes";
    files?: Array<{
        path: string;
        content: string;
        readOnly?: boolean;
    }>;
};

function normalizeCodeInputTests(tests: unknown): NormalizedCodeInputTest[] | undefined {
    if (!Array.isArray(tests)) return undefined;

    const normalized = tests
        .filter((test): test is Record<string, unknown> => {
            return !!test && typeof test === "object";
        })
        .map((test): NormalizedCodeInputTest => {
            const stdout =
                typeof test.stdout === "string"
                    ? test.stdout
                    : typeof test.output === "string"
                        ? test.output
                        : "";

            const match: "exact" | "includes" | undefined =
                test.match === "includes" || test.match === "exact"
                    ? test.match
                    : undefined;

            const files = Array.isArray(test.files)
                ? test.files
                    .filter((file): file is Record<string, unknown> => {
                        return !!file && typeof file === "object";
                    })
                    .map((file) => {
                        const normalizedFile: {
                            path: string;
                            content: string;
                            readOnly?: boolean;
                        } = {
                            path: normalizeText(file.path),
                            content:
                                typeof file.content === "string"
                                    ? file.content
                                    : "",
                        };

                        if (typeof file.readOnly === "boolean") {
                            normalizedFile.readOnly = file.readOnly;
                        }

                        return normalizedFile;
                    })
                    .filter((file) => file.path.length > 0)
                : undefined;

            const normalizedTest: NormalizedCodeInputTest = {
                stdout,
            };

            const stdin =
                typeof test.stdin === "string"
                    ? test.stdin
                    : typeof test.input === "string"
                        ? test.input
                        : undefined;

            if (stdin !== undefined) {
                normalizedTest.stdin = stdin;
            }

            if (match) {
                normalizedTest.match = match;
            }

            if (files && files.length > 0) {
                normalizedTest.files = files;
            }

            return normalizedTest;
        })
        .filter((test) => test.stdout.trim().length > 0);

    return normalized.length > 0 ? normalized : undefined;
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

function synchronizeEntryStarterFile(args: {
    exercise: Extract<
        TopicAuthoringDraft["quizDraft"][number],
        { kind: "code_input" }
    >;
    starterCode: string;
}): Extract<
    TopicAuthoringDraft["quizDraft"][number],
    { kind: "code_input" }
> {
    const starterFiles = Array.isArray(args.exercise.starterFiles)
        ? args.exercise.starterFiles
        : [];

    if (starterFiles.length === 0) {
        return {
            ...args.exercise,
            starterCode: args.starterCode,
        };
    }

    const explicitEntryPath = normalizeText(args.exercise.entryFilePath);
    const markedEntryPath = normalizeText(
        starterFiles.find(
            (file) => file.isEntry === true || file.entry === true,
        )?.path,
    );
    const conventionalSqlEntryPath = normalizeText(
        starterFiles.find((file) => normalizeText(file.path) === "query.sql")
            ?.path,
    );
    const singleFileEntryPath =
        starterFiles.length === 1
            ? normalizeText(starterFiles[0]?.path)
            : "";
    const entryFilePath =
        explicitEntryPath ||
        markedEntryPath ||
        conventionalSqlEntryPath ||
        singleFileEntryPath;

    if (!entryFilePath) {
        return {
            ...args.exercise,
            starterCode: args.starterCode,
        };
    }

    return {
        ...args.exercise,
        starterCode: args.starterCode,
        starterFiles: starterFiles.map((file) =>
            normalizeText(file.path) === entryFilePath
                ? {
                      ...file,
                      content: args.starterCode,
                  }
                : file,
        ),
    };
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

    const hasTests = Array.isArray(exercise.tests) && exercise.tests.length > 0;
    const hasSemanticChecks =
        Array.isArray(exercise.semanticChecks) &&
        exercise.semanticChecks.length > 0;

    if (exercise.recipeType === "sql_query") {
        return !!normalizeText(exercise.datasetId);
    }

    if (exercise.recipeType === "fixed_tests") {
        return hasTests;
    }

    if (exercise.recipeType === "semantic") {
        return hasSemanticChecks;
    }

    if (exercise.recipeType === "shell_task") {
        return true;
    }

    return hasTests || hasSemanticChecks;
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
            const defaultRecipeType = codeInput?.defaultRecipeType({
                exercise,
                seed,
            });

            const recipeType: CodeInputRecipeType =
                exercise.recipeType === "sql_query" ||
                exercise.recipeType === "fixed_tests" ||
                exercise.recipeType === "semantic" ||
                exercise.recipeType === "template_io" ||
                exercise.recipeType === "shell_task"
                    ? exercise.recipeType
                    : defaultRecipeType === "sql_query" ||
                    defaultRecipeType === "fixed_tests" ||
                    defaultRecipeType === "semantic" ||
                    defaultRecipeType === "template_io" ||
                    defaultRecipeType === "shell_task"
                        ? defaultRecipeType
                        : undefined;

            return {
                ...exercise,
                datasetId: datasetId || undefined,
                ...(recipeType ? { recipeType } : {}),
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

            const initialNormalizedTests = normalizeCodeInputTests(exercise.tests);

            const exerciseForProfileRepair = {
                ...exercise,
                ...(initialNormalizedTests
                    ? { tests: initialNormalizedTests }
                    : { tests: undefined }),
            };

            const repairedByProfile = codeInput?.repairDraft?.({
                exercise: exerciseForProfileRepair,
                seed: args.seed,
            });

            const repairedExercise = repairedByProfile ?? exerciseForProfileRepair;
            const normalizedTests = normalizeCodeInputTests(repairedExercise.tests);

            const semanticChecks = Array.isArray(repairedExercise.semanticChecks)
                ? repairedExercise.semanticChecks
                : undefined;

            const hasSemanticChecks =
                Array.isArray(semanticChecks) && semanticChecks.length > 0;

            const authoredRecipeType = repairedExercise.recipeType;

            const recipeType: CodeInputRecipeType =
                authoredRecipeType === "semantic" && hasSemanticChecks
                    ? "semantic"
                    : authoredRecipeType === "fixed_tests" && normalizedTests
                        ? "fixed_tests"
                    : authoredRecipeType === "sql_query"
                            ? "sql_query"
                            : authoredRecipeType === "template_io"
                                ? "template_io"
                                : authoredRecipeType === "shell_task"
                                    ? "shell_task"
                                : hasSemanticChecks
                                    ? "semantic"
                                    : normalizedTests
                                        ? "fixed_tests"
                                        : undefined;

            const {
                recipeType: _discardUnsafeRecipeType,
                tests: _discardUnsafeTests,
                semanticChecks: _discardUnsafeSemanticChecks,
                ...safeRepairedExercise
            } = repairedExercise;

            const revealsSolution = starterRevealsSolution(
                repairedExercise.starterCode,
                repairedExercise.solutionCode,
            );
            const repairedStarterCode = revealsSolution
                ? defaultStarterCodeForProfile(args.seed.profileId)
                : normalizeText(repairedExercise.starterCode);

            const repairedCodeInputBase = {
                ...exercise,
                ...safeRepairedExercise,
                kind: "code_input" as const,
                starterCode: repairedStarterCode,
                solutionCode: normalizeText(repairedExercise.solutionCode),
                ...(recipeType ? { recipeType } : {}),
                ...(normalizedTests ? { tests: normalizedTests } : {}),
                ...(hasSemanticChecks ? { semanticChecks } : {}),
            } satisfies Extract<
                TopicAuthoringDraft["quizDraft"][number],
                { kind: "code_input" }
            >;

            return revealsSolution
                ? synchronizeEntryStarterFile({
                      exercise: repairedCodeInputBase,
                      starterCode: repairedStarterCode,
                  })
                : repairedCodeInputBase;
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
