import type {
    ManifestCard,
    ManifestExercise,
    ManifestSketch,
    TopicAuthoringDraft,
    TopicBundleManifest,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import type { SubjectShapePack } from "@zoeskoul/curriculum-profiles";
import { buildExerciseMessageKeys } from "../messages/buildMessageKeys.js";
import { validateTopicMessageBases } from "../messages/validateTopicMessageBases.js";

type DraftExercise = TopicAuthoringDraft["quizDraft"][number];

function optionIdsFromCount(count: number) {
    return Array.from({ length: count }, (_, i) => String.fromCharCode(97 + i));
}

function normalizeText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function uniqueNonEmpty(values: string[]) {
    return Array.from(new Set(values.map((x) => x.trim()).filter(Boolean)));
}

function stripSqlComments(sql: string): string {
    return String(sql ?? "")
        .replace(/--.*$/gm, " ")
        .replace(/\/\*[\s\S]*?\*\//g, " ");
}

function isSqlMutation(sql: string): boolean {
    const cleaned = stripSqlComments(sql).trim().toLowerCase();

    return /^(insert|update|delete|replace|create|drop|alter)\b/.test(cleaned);
}

function normalizeIdentifier(identifier: string): string {
    return String(identifier ?? "")
        .trim()
        .replace(/^["'`\[]+/, "")
        .replace(/["'`\]]+$/, "");
}

function quoteSqliteIdentifier(identifier: string): string {
    const clean = normalizeIdentifier(identifier);

    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(clean)) {
        throw new Error(`Unsafe SQL identifier for generated checkSql: ${identifier}`);
    }

    return `"${clean.replace(/"/g, '""')}"`;
}

function sqlStringLiteral(value: string): string {
    return `'${String(value).replace(/'/g, "''")}'`;
}

function extractMutationTableName(sql: string): {
    tableName: string | null;
    action:
        | "insert"
        | "replace"
        | "update"
        | "delete"
        | "create_table"
        | "alter_table"
        | "drop_table"
        | "other";
} {
    const cleaned = stripSqlComments(sql).trim();

    const insertMatch = cleaned.match(
        /^\s*insert\s+(?:or\s+\w+\s+)?into\s+["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/i,
    );
    if (insertMatch?.[1]) {
        return {
            tableName: normalizeIdentifier(insertMatch[1]),
            action: "insert",
        };
    }

    const replaceMatch = cleaned.match(
        /^\s*replace\s+(?:or\s+\w+\s+)?into\s+["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/i,
    );
    if (replaceMatch?.[1]) {
        return {
            tableName: normalizeIdentifier(replaceMatch[1]),
            action: "replace",
        };
    }

    const updateMatch = cleaned.match(
        /^\s*update\s+["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/i,
    );
    if (updateMatch?.[1]) {
        return {
            tableName: normalizeIdentifier(updateMatch[1]),
            action: "update",
        };
    }

    const deleteMatch = cleaned.match(
        /^\s*delete\s+from\s+["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/i,
    );
    if (deleteMatch?.[1]) {
        return {
            tableName: normalizeIdentifier(deleteMatch[1]),
            action: "delete",
        };
    }

    const createTableMatch = cleaned.match(
        /^\s*create\s+table\s+(?:if\s+not\s+exists\s+)?["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/i,
    );
    if (createTableMatch?.[1]) {
        return {
            tableName: normalizeIdentifier(createTableMatch[1]),
            action: "create_table",
        };
    }

    const alterTableMatch = cleaned.match(
        /^\s*alter\s+table\s+["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/i,
    );
    if (alterTableMatch?.[1]) {
        return {
            tableName: normalizeIdentifier(alterTableMatch[1]),
            action: "alter_table",
        };
    }

    const dropTableMatch = cleaned.match(
        /^\s*drop\s+table\s+(?:if\s+exists\s+)?["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/i,
    );
    if (dropTableMatch?.[1]) {
        return {
            tableName: normalizeIdentifier(dropTableMatch[1]),
            action: "drop_table",
        };
    }

    return {
        tableName: null,
        action: "other",
    };
}

function inferSqlCheckSql(solutionCode: string): string | undefined {
    if (!isSqlMutation(solutionCode)) return undefined;

    const { tableName, action } = extractMutationTableName(solutionCode);
    if (!tableName) return undefined;

    const quoted = quoteSqliteIdentifier(tableName);
    const tableLiteral = sqlStringLiteral(tableName);

    if (
        action === "insert" ||
        action === "replace" ||
        action === "update" ||
        action === "delete"
    ) {
        return `SELECT * FROM ${quoted} ORDER BY 1;`;
    }

    if (action === "create_table" || action === "alter_table") {
        return `SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name = ${tableLiteral};`;
    }

    if (action === "drop_table") {
        return `SELECT COUNT(*) AS table_count FROM sqlite_master WHERE type = 'table' AND name = ${tableLiteral};`;
    }

    return undefined;
}

function codeInputIds(draft: TopicAuthoringDraft) {
    return draft.quizDraft
        .filter((exercise) => exercise.kind === "code_input")
        .map((exercise) => exercise.id);
}

function buildProjectStepIds(draft: TopicAuthoringDraft) {
    const codeIds = codeInputIds(draft);
    const codeIdSet = new Set(codeIds);

    const explicitStepIds = (draft.projectDraft?.stepIds ?? []).filter((id) =>
        codeIdSet.has(id),
    );

    return uniqueNonEmpty([...explicitStepIds, ...codeIds]);
}

function quizExercises(draft: TopicAuthoringDraft) {
    return draft.quizDraft.filter((exercise) => exercise.kind !== "code_input");
}

function projectStepIdFromExerciseId(id: string) {
    return id
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

export function buildTopicBundleFromDraft(args: {
    shape: SubjectShapePack;
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
    moduleOrder: number;
    sectionOrder: number;
}): TopicBundleManifest {
    const { shape, seed, draft, moduleOrder, sectionOrder } = args;
    const kp = shape.subjectManifest.keyPatterns;

    const logicalModuleSlug = shape.subjectManifest.moduleSlug(moduleOrder);
    const logicalSectionSlug = shape.subjectManifest.sectionSlug(
        moduleOrder,
        sectionOrder,
    );
    const prefix = shape.subjectManifest.modulePrefix(moduleOrder);

    const projectStepIds = buildProjectStepIds(draft);
    const quizOnlyExercises = quizExercises(draft);

    const sketchCards: ManifestCard[] = draft.sketchBlocks.map((block, index) => ({
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

    const quizCard: ManifestCard[] =
        quizOnlyExercises.length > 0
            ? [
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
                        n: Math.min(5, quizOnlyExercises.length),
                        allowReveal: true,
                        preferKind: null,
                        maxAttempts: 10,
                    },
                },
            ]
            : [];

    const projectCard: ManifestCard[] =
        projectStepIds.length > 0
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
                        steps: projectStepIds.map((exerciseId) => {
                            const stepId = projectStepIdFromExerciseId(exerciseId);

                            return {
                                id: stepId,
                                titleKey: kp.topicProjectStepTitleKey(
                                    seed.subjectSlug,
                                    logicalModuleSlug,
                                    seed.topicId,
                                    stepId,
                                ),
                                exerciseKey: exerciseId,
                                difficulty: "easy",
                                preferKind: "code_input",
                                seedPolicy: "global",
                                maxAttempts: 10,
                            };
                        }),
                    },
                },
            ]
            : [];

    const sketches: ManifestSketch[] = draft.sketchBlocks.map((block) => ({
        id: block.id,
        archetype: "paragraph" as const,
        titleKey: kp.sketchTitleKey(
            seed.subjectSlug,
            logicalModuleSlug,
            seed.topicId,
            block.id,
        ),
        bodyKey: kp.sketchBodyKey(
            seed.subjectSlug,
            logicalModuleSlug,
            seed.topicId,
            block.id,
        ),
    }));

    validateTopicMessageBases(
        draft.quizDraft.map((exercise) => ({
            id: exercise.id,
            messageBase: (exercise as { messageBase?: string }).messageBase,
        })),
    );

    const projectStepIdSet = new Set(projectStepIds);

    const exercises: ManifestExercise[] = draft.quizDraft.map((exercise) => {
        const optionIdsForKeys =
            exercise.kind === "single_choice" || exercise.kind === "multi_choice"
                ? optionIdsFromCount(exercise.options.length)
                : [];

        const messageKeys = buildExerciseMessageKeys({
            scope: {
                subjectSlug: seed.subjectSlug,
                moduleSlug: logicalModuleSlug,
                topicId: seed.topicId,
            },
            exerciseId: exercise.id,
            messageBase: (exercise as { messageBase?: string }).messageBase,
            optionIds: optionIdsForKeys,
        });

        const messageBase = messageKeys.qualifiedBase;

        /**
         * Final rule:
         * - code_input is project.
         * - non-code is quiz.
         */
        const isProjectExercise =
            exercise.kind === "code_input" || projectStepIdSet.has(exercise.id);

        if (exercise.kind === "single_choice") {
            const optionIds = optionIdsFromCount(exercise.options.length);
            const correctOptionId = normalizeText(exercise.correctOptionIds[0]);

            if (!correctOptionId || !optionIds.includes(correctOptionId)) {
                throw new Error(
                    `Invalid single_choice exercise "${exercise.id}": correct answer key must be included in available optionIds.\n\nExpected one of: ${JSON.stringify(
                        optionIds,
                    )}\nReceived: ${JSON.stringify(
                        exercise.correctOptionIds,
                    )}\n\nExercise:\n${JSON.stringify(exercise, null, 2)}`,
                );
            }

            return {
                id: exercise.id,
                kind: "single_choice" as const,
                purpose: "quiz" as const,
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
                    `Invalid multi_choice exercise "${exercise.id}": no correct answer key is included in available optionIds.\n\nExpected values from: ${JSON.stringify(
                        optionIds,
                    )}\nReceived: ${JSON.stringify(
                        exercise.correctOptionIds,
                    )}\n\nExercise:\n${JSON.stringify(exercise, null, 2)}`,
                );
            }

            return {
                id: exercise.id,
                kind: "multi_choice" as const,
                purpose: "quiz" as const,
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

            const expectedTokenIds = exercise.correctOrder.map(
                (token) => tokenMap.get(normalizeText(token)) ?? "",
            );

            if (
                expectedTokenIds.length !== exercise.tokens.length ||
                expectedTokenIds.some((id) => !id)
            ) {
                throw new Error(
                    `Invalid drag_reorder exercise "${exercise.id}": every correctOrder value must be included in tokens.\n\nTokens: ${JSON.stringify(
                        exercise.tokens,
                    )}\nCorrect order: ${JSON.stringify(
                        exercise.correctOrder,
                    )}\n\nExercise:\n${JSON.stringify(exercise, null, 2)}`,
                );
            }

            return {
                id: exercise.id,
                kind: "drag_reorder" as const,
                purpose: "quiz" as const,
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
                    `Invalid fill_blank_choice exercise "${exercise.id}": correctValue must be included in choices.\n\nChoices: ${JSON.stringify(
                        exercise.choices,
                    )}\nCorrect value: ${JSON.stringify(
                        exercise.correctValue,
                    )}\n\nExercise:\n${JSON.stringify(exercise, null, 2)}`,
                );
            }

            return {
                id: exercise.id,
                kind: "fill_blank_choice" as const,
                purpose: "quiz" as const,
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

                const effectiveDatasetId =
                    normalizeText(exercise.datasetId) || normalizeText(moduleDatasetId);

                if (!effectiveDatasetId) {
                    throw new Error(
                        `SQL code_input exercise "${exercise.id}" is missing an effective datasetId`,
                    );
                }

                const moduleDialect =
                    seed.moduleRuntimeDefaults?.kind === "sql"
                        ? seed.moduleRuntimeDefaults.fixedSqlDialect
                        : undefined;

                const moduleResultShape =
                    seed.moduleRuntimeDefaults?.kind === "sql"
                        ? seed.moduleRuntimeDefaults.resultShape
                        : undefined;

                const solutionCode = normalizeText(exercise.solutionCode);
                const explicitCheckSql = normalizeText(exercise.checkSql);
                const inferredCheckSql = inferSqlCheckSql(solutionCode);
                const checkSql = explicitCheckSql || inferredCheckSql;

                if (isSqlMutation(solutionCode) && !checkSql) {
                    throw new Error(
                        [
                            `SQL mutation code_input exercise "${exercise.id}" needs checkSql.`,
                            `Topic: ${seed.topicId}`,
                            `Solution starts with a mutation statement, but the compiler could not infer a safe post-check query.`,
                            `Add "checkSql" to the TopicAuthoringDraft code_input item.`,
                        ].join("\n"),
                    );
                }

                return {
                    id: exercise.id,
                    kind: "code_input" as const,
                    purpose: "project" as const,
                    weight: 1,
                    messageBase,
                    language: "sql" as const,
                    fixedSqlDialect:
                        moduleDialect === "sqlite" ? "sqlite" : "sqlite",
                    recipe: {
                        type: "sql_query" as const,
                        datasetId: effectiveDatasetId,
                        resultShape:
                            moduleResultShape === "table" ? "table" : "table",
                        solutionCode,
                        ...(checkSql ? { checkSql } : {}),
                    },
                };
            }

            return {
                id: exercise.id,
                kind: "code_input" as const,
                purpose: "project" as const,
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

        throw new Error(
            `Unsupported exercise kind: ${(exercise as { kind: string }).kind}`,
        );
    });

    return {
        topicId: seed.topicId,
        subjectSlug: seed.subjectSlug,
        moduleSlug: logicalModuleSlug,
        sectionSlug: logicalSectionSlug,
        prefix,
        minutes: draft.minutes,
        topic: {
            labelKey: kp.topicLabelKey(
                seed.subjectSlug,
                logicalModuleSlug,
                seed.topicId,
            ),
            summaryKey: kp.topicSummaryKey(
                seed.subjectSlug,
                logicalModuleSlug,
                seed.topicId,
            ),
        },
        cards: [...sketchCards, ...quizCard, ...projectCard],
        sketches,
        exercises,
    };
}
