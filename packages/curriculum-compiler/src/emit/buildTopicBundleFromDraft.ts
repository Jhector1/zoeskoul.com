import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import type { SubjectShapePack } from "@zoeskoul/curriculum-profiles";

function optionIdsFromCount(count: number) {
    return Array.from({ length: count }, (_, i) => String.fromCharCode(97 + i));
}

function normalizeText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

export function buildTopicBundleFromDraft(args: {
    shape: SubjectShapePack;
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
    moduleOrder: number;
    sectionOrder: number;
}) {
    const { shape, seed, draft, moduleOrder, sectionOrder } = args;
    const kp = shape.subjectManifest.keyPatterns;

    const logicalModuleSlug = shape.subjectManifest.moduleSlug(moduleOrder);
    const logicalSectionSlug = shape.subjectManifest.sectionSlug(moduleOrder, sectionOrder);
    const prefix = shape.subjectManifest.modulePrefix(moduleOrder);

    const sketchCards = draft.sketchBlocks.map((block, index) => ({
        id: `sketch${index}`,
        kind: "sketch" as const,
        titleKey: kp.topicCardTitleKey(
            seed.subjectSlug,
            logicalModuleSlug,
            seed.topicId,
            `sketch${index}`,
        ),
        sketchId: block.id,
        height: 420,
    }));

    const projectStepIds = draft.projectDraft?.stepIds ?? [];
    const hasProject = projectStepIds.length > 0;

    const projectCard = hasProject
        ? [
            {
                id: "project",
                kind: "project" as const,
                titleKey: kp.topicCardTitleKey(
                    seed.subjectSlug,
                    logicalModuleSlug,
                    seed.topicId,
                    "project",
                ),
                project: {
                    difficulty: "easy",
                    allowReveal: true,
                    preferKind: "code_input",
                    maxAttempts: 10,
                    steps: projectStepIds.map((stepId) => ({
                        id: stepId,
                        titleKey: kp.topicProjectStepTitleKey(
                            seed.subjectSlug,
                            logicalModuleSlug,
                            seed.topicId,
                            stepId,
                        ),
                        exerciseKey: stepId,
                        difficulty: "easy",
                        preferKind: "code_input",
                        seedPolicy: "global",
                        maxAttempts: 10,
                    })),
                },
            },
        ]
        : [];

    const quizCard = [
        {
            id: "quiz",
            kind: "quiz" as const,
            titleKey: kp.topicCardTitleKey(
                seed.subjectSlug,
                logicalModuleSlug,
                seed.topicId,
                "quiz",
            ),
            quiz: {
                difficulty: "easy",
                n: Math.min(5, draft.quizDraft.filter((x) => x.kind !== "code_input").length || 3),
                allowReveal: true,
                preferKind: null,
                maxAttempts: 10,
            },
        },
    ];

    const sketches = draft.sketchBlocks.map((block) => ({
        id: block.id,
        archetype: "paragraph" as const,
        titleKey: kp.sketchTitleKey(seed.subjectSlug, logicalModuleSlug, seed.topicId, block.id),
        bodyKey: kp.sketchBodyKey(seed.subjectSlug, logicalModuleSlug, seed.topicId, block.id),
    }));

    const exercises = draft.quizDraft.map((exercise) => {
        const messageBase = kp.exerciseMessageBase(exercise.id);
        const isProjectExercise = projectStepIds.includes(exercise.id);

        if (exercise.kind === "single_choice") {
            const optionIds = optionIdsFromCount(exercise.options.length);
            const correctOptionId = normalizeText(exercise.correctOptionIds[0]);

            if (!correctOptionId || !optionIds.includes(correctOptionId)) {
                throw new Error(
                    `Invalid single_choice exercise "${exercise.id}": correct answer key must be included in available optionIds.\n\nExpected one of: ${JSON.stringify(optionIds)}\nReceived: ${JSON.stringify(exercise.correctOptionIds)}\n\nExercise:\n${JSON.stringify(exercise, null, 2)}`
                );
            }

            return {
                id: exercise.id,
                kind: "single_choice" as const,
                purpose: isProjectExercise ? "project" as const : "quiz" as const,
                weight: 1,
                messageBase,
                optionIds,
                expected: {
                    kind: "single_choice" as const,
                    optionId: correctOptionId,
                },
            };
        }

        if (exercise.kind === "multi_choice") {
            const optionIds = optionIdsFromCount(exercise.options.length);
            const correctOptionIds = exercise.correctOptionIds
                .map(normalizeText)
                .filter((id) => optionIds.includes(id));

            if (correctOptionIds.length === 0) {
                throw new Error(
                    `Invalid multi_choice exercise "${exercise.id}": no correct answer key is included in available optionIds.\n\nExpected values from: ${JSON.stringify(optionIds)}\nReceived: ${JSON.stringify(exercise.correctOptionIds)}\n\nExercise:\n${JSON.stringify(exercise, null, 2)}`
                );
            }

            return {
                id: exercise.id,
                kind: "multi_choice" as const,
                purpose: isProjectExercise ? "project" as const : "quiz" as const,
                weight: 1,
                messageBase,
                optionIds,
                expected: {
                    kind: "multi_choice" as const,
                    optionIds: correctOptionIds,
                },
            };
        }

        if (exercise.kind === "drag_reorder") {
            const tokenIds = exercise.tokens.map((_, i) => `t${i + 1}`);
            const tokenMap = new Map<string, string>();

            exercise.tokens.forEach((token, i) => {
                tokenMap.set(normalizeText(token), tokenIds[i]);
            });

            const expectedTokenIds = exercise.correctOrder.map((token) =>
                tokenMap.get(normalizeText(token)) ?? "",
            );

            if (
                expectedTokenIds.length !== exercise.tokens.length ||
                expectedTokenIds.some((id) => !id)
            ) {
                throw new Error(
                    `Invalid drag_reorder exercise "${exercise.id}": every correctOrder value must be included in tokens.\n\nTokens: ${JSON.stringify(exercise.tokens)}\nCorrect order: ${JSON.stringify(exercise.correctOrder)}\n\nExercise:\n${JSON.stringify(exercise, null, 2)}`
                );
            }

            return {
                id: exercise.id,
                kind: "drag_reorder" as const,
                purpose: isProjectExercise ? "project" as const : "quiz" as const,
                weight: 1,
                messageBase,
                tokenIds,
                expected: {
                    kind: "drag_reorder" as const,
                    tokenIds: expectedTokenIds,
                },
            };
        }

        if (exercise.kind === "fill_blank_choice") {
            const correctValue = normalizeText(exercise.correctValue);
            const normalizedChoices = exercise.choices.map(normalizeText);

            if (
                !correctValue ||
                !normalizedChoices.some((choice) => choice === correctValue)
            ) {
                throw new Error(
                    `Invalid fill_blank_choice exercise "${exercise.id}": correctValue must be included in choices.\n\nChoices: ${JSON.stringify(exercise.choices)}\nCorrect value: ${JSON.stringify(exercise.correctValue)}\n\nExercise:\n${JSON.stringify(exercise, null, 2)}`
                );
            }

            return {
                id: exercise.id,
                kind: "fill_blank_choice" as const,
                purpose: isProjectExercise ? "project" as const : "quiz" as const,
                weight: 1,
                messageBase,
                choiceCount: exercise.choices.length,
                expected: {
                    kind: "fill_blank_choice" as const,
                    value: correctValue,
                },
            };
        }

        if (exercise.kind === "code_input") {
            if (shape.profileId === "sql") {
                const moduleDatasetId =
                    seed.moduleRuntimeDefaults?.kind === "sql"
                        ? seed.moduleRuntimeDefaults.datasetId
                        : undefined;

                const moduleDialect =
                    seed.moduleRuntimeDefaults?.kind === "sql"
                        ? seed.moduleRuntimeDefaults.fixedSqlDialect
                        : undefined;

                const moduleResultShape =
                    seed.moduleRuntimeDefaults?.kind === "sql"
                        ? seed.moduleRuntimeDefaults.resultShape
                        : undefined;

                return {
                    id: exercise.id,
                    kind: "code_input" as const,
                    purpose: isProjectExercise ? "project" as const : "quiz" as const,
                    weight: 1,
                    messageBase,
                    language: "sql" as const,
                    fixedSqlDialect: moduleDialect === "sqlite" ? "sqlite" : "sqlite",
                    recipe: {
                        type: "sql_query" as const,
                        datasetId: exercise.datasetId ?? moduleDatasetId ?? "products_catalog",
                        resultShape: moduleResultShape === "table" ? "table" : "table",
                        solutionCode: exercise.solutionCode,
                    },
                };
            }

            return {
                id: exercise.id,
                kind: "code_input" as const,
                purpose: isProjectExercise ? "project" as const : "quiz" as const,
                weight: 1,
                messageBase,
                language: "python" as const,
                showExpectedExample: true,
                recipe:
                    exercise.recipeType === "fixed_tests"
                        ? {
                            type: "fixed_tests" as const,
                            tests: [],
                            solutionCode: exercise.solutionCode,
                        }
                        : {
                            type: "template_io" as const,
                            vars: {},
                            tests: [],
                            solutionTemplate: exercise.solutionCode,
                        },
            };
        }

        throw new Error(`Unsupported exercise kind: ${(exercise as { kind: string }).kind}`);
    });

    return {
        topicId: seed.topicId,
        subjectSlug: seed.subjectSlug,
        moduleSlug: logicalModuleSlug,
        sectionSlug: logicalSectionSlug,
        prefix,
        minutes: draft.minutes,
        topic: {
            labelKey: kp.topicLabelKey(seed.subjectSlug, logicalModuleSlug, seed.topicId),
            summaryKey: kp.topicSummaryKey(seed.subjectSlug, logicalModuleSlug, seed.topicId),
        },
        cards: [...sketchCards, ...projectCard, ...quizCard],
        sketches,
        exercises,
    };
}