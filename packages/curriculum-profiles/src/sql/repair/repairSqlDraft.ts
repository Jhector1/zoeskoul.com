import type {
    ExerciseKindKey,
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import {
    makePolicyRepair,
} from "../../shared/repairExercisePolicyDraft.js";
import type { RepairReport } from "../../shared/profileServices.js";

type DraftExercise = TopicAuthoringDraft["quizDraft"][number];
type CodeInputDraft = Extract<DraftExercise, { kind: "code_input" }>;

const KIND_ORDER: ExerciseKindKey[] = [
    "single_choice",
    "multi_choice",
    "drag_reorder",
    "fill_blank_choice",
    "code_input",
];

function safeSlug(value: unknown): string {
    return (
        String(value ?? "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || "sql-topic"
    );
}

function topicGoals(seed: TopicSeed): string[] {
    const goals = Array.isArray(seed.topicLearningGoals)
        ? seed.topicLearningGoals
              .map((goal) => String(goal ?? "").trim())
              .filter(Boolean)
        : [];

    if (goals.length > 0) return goals;

    const fallback = String(seed.summary ?? seed.title ?? seed.topicId ?? "").trim();
    return fallback ? [fallback] : ["Apply the SQL concept taught in this topic."];
}

function commonHelp(seed: TopicSeed, goals: string[]) {
    return {
        concept: `This question checks the exact learning goals for ${seed.title || seed.topicId}.`,
        hint_1: goals[0] ?? "Use the first topic learning goal.",
        hint_2:
            goals[1] ??
            "Check that the answer matches this topic rather than an adjacent lesson.",
    };
}

function makeSqlFallbackExercise(args: {
    seed: TopicSeed;
    kind: Exclude<ExerciseKindKey, "code_input">;
    index: number;
}): DraftExercise {
    const goals = topicGoals(args.seed);
    const primary = goals[0] ?? "Apply the topic's SQL rule.";
    const secondary =
        goals[1] ??
        "State the intended result grain before choosing the SQL expression.";
    const idBase = `${safeSlug(args.seed.topicId)}-policy-${args.kind}-${args.index}`;
    const help = commonHelp(args.seed, goals);

    switch (args.kind) {
        case "single_choice":
            return {
                id: idBase,
                kind: "single_choice",
                title: "Match the topic goal",
                prompt: `Which choice best applies this topic's SQL goal: ${primary}`,
                hint: "Choose the option that directly matches the authored topic goal.",
                help,
                options: [
                    primary,
                    "Ignore the requested result grain.",
                    "Reuse a different topic's rule without checking the requirement.",
                    "Choose SQL only because it is shorter.",
                ],
                correctOptionIds: ["a"],
            };

        case "multi_choice":
            return {
                id: idBase,
                kind: "multi_choice",
                title: "Apply the count-safe topic rules",
                prompt:
                    "Which statements are aligned with this topic's authored learning goals? Select all that apply.",
                hint: "Choose the statements copied from the topic's actual goals.",
                help,
                options: [
                    primary,
                    secondary,
                    "Ignore duplicate-producing relationships when choosing a count.",
                    "Use an adjacent topic's technique even when it changes the requested metric.",
                ],
                correctOptionIds: ["a", "b"],
            };

        case "drag_reorder": {
            const tokens = [
                "Read the requested metric",
                "State the intended result grain",
                "Choose SQL that matches the topic goal",
                "Run the query and verify the result",
            ];
            return {
                id: idBase,
                kind: "drag_reorder",
                title: "Build a goal-aligned SQL check",
                prompt: "Put the SQL reasoning steps in a safe order.",
                hint: "Define the metric and grain before choosing the expression.",
                help,
                tokens,
                correctOrder: [...tokens],
            };
        }

        case "fill_blank_choice":
            return {
                id: idBase,
                kind: "fill_blank_choice",
                title: "Stay inside the topic boundary",
                prompt: "Complete the sentence about choosing SQL for this exercise.",
                hint: "Use the exact goals authored for this topic.",
                help,
                template:
                    "The query and explanation should match the topic [blank1].",
                choices: [
                    "learning goals",
                    "previous lesson",
                    "random syntax",
                    "unrelated dataset",
                ],
                correctValue: "learning goals",
            };
    }
}

function normalizeSqlForComparison(value: unknown): string {
    return String(value ?? "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/--.*$/gm, "")
        .replace(/\s+/g, "")
        .replace(/;+$/g, "")
        .toLowerCase()
        .trim();
}

function normalizeWorkspaceFilePath(value: unknown): string {
    return String(value ?? "").trim();
}

function replaceSqlEntryStarter(args: {
    exercise: CodeInputDraft;
    starterCode: string;
}): CodeInputDraft {
    const files = Array.isArray(args.exercise.starterFiles)
        ? args.exercise.starterFiles
        : [];

    if (files.length === 0) {
        return {
            ...args.exercise,
            starterCode: args.starterCode,
        };
    }

    const explicitEntryPath = normalizeWorkspaceFilePath(
        args.exercise.entryFilePath,
    );
    const markedEntryPath = normalizeWorkspaceFilePath(
        files.find(
            (file) => file.isEntry === true || file.entry === true,
        )?.path,
    );
    const inferredEntryPath =
        files.length === 1
            ? normalizeWorkspaceFilePath(files[0]?.path)
            : "query.sql";
    const entryFilePath =
        explicitEntryPath || markedEntryPath || inferredEntryPath;

    return {
        ...args.exercise,
        starterCode: args.starterCode,
        starterFiles: files.map((file) =>
            normalizeWorkspaceFilePath(file.path) === entryFilePath
                ? {
                      ...file,
                      content: args.starterCode,
                  }
                : file,
        ),
    };
}

function normalizeSqlIdentifier(value: string): string {
    const trimmed = value.trim();
    const lastPart = trimmed.split(".").at(-1) ?? trimmed;

    if (
        (lastPart.startsWith('"') && lastPart.endsWith('"')) ||
        (lastPart.startsWith("`") && lastPart.endsWith("`")) ||
        (lastPart.startsWith("[") && lastPart.endsWith("]"))
    ) {
        return lastPart.slice(1, -1).toLowerCase();
    }

    return lastPart.toLowerCase();
}

function findMatchingSqlParenthesis(
    sql: string,
    openIndex: number,
): number {
    let depth = 0;
    let quote: "'" | '"' | "`" | "]" | null = null;

    for (let index = openIndex; index < sql.length; index += 1) {
        const character = sql[index];

        if (quote) {
            if (quote === "]") {
                if (character === "]") quote = null;
                continue;
            }

            if (character === quote) {
                if (
                    (quote === "'" || quote === '"') &&
                    sql[index + 1] === quote
                ) {
                    index += 1;
                    continue;
                }
                quote = null;
            }
            continue;
        }

        if (
            character === "'" ||
            character === '"' ||
            character === "`"
        ) {
            quote = character;
            continue;
        }
        if (character === "[") {
            quote = "]";
            continue;
        }
        if (character === "(") {
            depth += 1;
            continue;
        }
        if (character === ")") {
            depth -= 1;
            if (depth === 0) return index;
        }
    }

    return -1;
}

function splitTopLevelSqlList(value: string): string[] {
    const parts: string[] = [];
    let start = 0;
    let depth = 0;
    let quote: "'" | '"' | "`" | "]" | null = null;

    for (let index = 0; index < value.length; index += 1) {
        const character = value[index];

        if (quote) {
            if (quote === "]") {
                if (character === "]") quote = null;
                continue;
            }

            if (character === quote) {
                if (
                    (quote === "'" || quote === '"') &&
                    value[index + 1] === quote
                ) {
                    index += 1;
                    continue;
                }
                quote = null;
            }
            continue;
        }

        if (
            character === "'" ||
            character === '"' ||
            character === "`"
        ) {
            quote = character;
            continue;
        }
        if (character === "[") {
            quote = "]";
            continue;
        }
        if (character === "(") {
            depth += 1;
            continue;
        }
        if (character === ")") {
            depth = Math.max(0, depth - 1);
            continue;
        }
        if (character === "," && depth === 0) {
            parts.push(value.slice(start, index));
            start = index + 1;
        }
    }

    parts.push(value.slice(start));
    return parts;
}

function extractSqliteColumnDefaults(
    schemaSql: string,
): Map<string, Map<string, string>> {
    const defaultsByTable = new Map<
        string,
        Map<string, string>
    >();
    const tablePattern =
        /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_]*)(?:\.(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_]*))?)\s*\(/gi;

    let match: RegExpExecArray | null;
    while ((match = tablePattern.exec(schemaSql))) {
        const openIndex = tablePattern.lastIndex - 1;
        const closeIndex = findMatchingSqlParenthesis(
            schemaSql,
            openIndex,
        );
        if (closeIndex < 0) continue;

        const tableName = normalizeSqlIdentifier(match[1] ?? "");
        const columnDefaults = new Map<string, string>();
        const body = schemaSql.slice(openIndex + 1, closeIndex);

        for (const rawDefinition of splitTopLevelSqlList(body)) {
            const definition = rawDefinition.trim();
            if (
                /^(?:CONSTRAINT|PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK)\b/i.test(
                    definition,
                )
            ) {
                continue;
            }

            const columnMatch = definition.match(
                /^((?:"(?:[^"]|"")*"|`[^`]*`|\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_]*))\s+([\s\S]+)$/,
            );
            if (!columnMatch) continue;

            const defaultMatch = (columnMatch[2] ?? "").match(
                /\bDEFAULT\s+('(?:''|[^'])*'|"(?:""|[^"])*"|[-+]?(?:\d+(?:\.\d*)?|\.\d+)|NULL|CURRENT_(?:TIME|DATE|TIMESTAMP)|\([^)]*\)|[A-Za-z_][A-Za-z0-9_]*)/i,
            );
            if (!defaultMatch) continue;

            columnDefaults.set(
                normalizeSqlIdentifier(columnMatch[1] ?? ""),
                defaultMatch[1] ?? "",
            );
        }

        if (columnDefaults.size > 0) {
            defaultsByTable.set(tableName, columnDefaults);
        }

        tablePattern.lastIndex = closeIndex + 1;
    }

    return defaultsByTable;
}

function preserveSqlValueWhitespace(
    original: string,
    replacement: string,
): string {
    const leading = original.match(/^\s*/)?.[0] ?? "";
    const trailing = original.match(/\s*$/)?.[0] ?? "";
    return `${leading}${replacement}${trailing}`;
}

function repairSqliteInsertDefaults(args: {
    sql: string;
    defaultsByTable: Map<string, Map<string, string>>;
}): { sql: string; changed: boolean } {
    const insertPattern =
        /\bINSERT\s+INTO\s+((?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_]*)(?:\.(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_]*))?)\s*\(/gi;
    let cursor = 0;
    let output = "";
    let changed = false;
    let match: RegExpExecArray | null;

    while ((match = insertPattern.exec(args.sql))) {
        const columnOpenIndex = insertPattern.lastIndex - 1;
        const columnCloseIndex = findMatchingSqlParenthesis(
            args.sql,
            columnOpenIndex,
        );
        if (columnCloseIndex < 0) continue;

        const afterColumns = args.sql.slice(columnCloseIndex + 1);
        const valuesMatch = afterColumns.match(/^\s*VALUES\b/i);
        if (!valuesMatch) {
            insertPattern.lastIndex = columnCloseIndex + 1;
            continue;
        }

        const valuesStart =
            columnCloseIndex + 1 + valuesMatch[0].length;
        let statementEnd = valuesStart;
        let quote: "'" | '"' | "`" | "]" | null = null;
        let depth = 0;

        for (
            statementEnd = valuesStart;
            statementEnd < args.sql.length;
            statementEnd += 1
        ) {
            const character = args.sql[statementEnd];

            if (quote) {
                if (quote === "]") {
                    if (character === "]") quote = null;
                    continue;
                }

                if (character === quote) {
                    if (
                        (quote === "'" || quote === '"') &&
                        args.sql[statementEnd + 1] === quote
                    ) {
                        statementEnd += 1;
                        continue;
                    }
                    quote = null;
                }
                continue;
            }

            if (
                character === "'" ||
                character === '"' ||
                character === "`"
            ) {
                quote = character;
                continue;
            }
            if (character === "[") {
                quote = "]";
                continue;
            }
            if (character === "(") {
                depth += 1;
                continue;
            }
            if (character === ")") {
                depth = Math.max(0, depth - 1);
                continue;
            }
            if (character === ";" && depth === 0) break;
        }

        const tableDefaults = args.defaultsByTable.get(
            normalizeSqlIdentifier(match[1] ?? ""),
        );
        if (!tableDefaults) {
            insertPattern.lastIndex = statementEnd + 1;
            continue;
        }

        const columns = splitTopLevelSqlList(
            args.sql.slice(columnOpenIndex + 1, columnCloseIndex),
        ).map(normalizeSqlIdentifier);
        const valuesSql = args.sql.slice(valuesStart, statementEnd);
        const rows = splitTopLevelSqlList(valuesSql);
        let rowsChanged = false;

        const repairedRows = rows.map((row) => {
            const openOffset = row.indexOf("(");
            if (openOffset < 0) return row;

            const closeOffset = findMatchingSqlParenthesis(
                row,
                openOffset,
            );
            if (
                closeOffset < 0 ||
                row.slice(closeOffset + 1).trim().length > 0
            ) {
                return row;
            }

            const values = splitTopLevelSqlList(
                row.slice(openOffset + 1, closeOffset),
            );
            if (values.length !== columns.length) return row;

            const repairedValues = values.map((value, index) => {
                if (!/^DEFAULT$/i.test(value.trim())) return value;

                const declaredDefault = tableDefaults.get(
                    columns[index] ?? "",
                );
                if (!declaredDefault) return value;

                rowsChanged = true;
                return preserveSqlValueWhitespace(
                    value,
                    declaredDefault,
                );
            });

            if (!rowsChanged) return row;

            return [
                row.slice(0, openOffset + 1),
                repairedValues.join(","),
                row.slice(closeOffset),
            ].join("");
        });

        if (!rowsChanged) {
            insertPattern.lastIndex = statementEnd + 1;
            continue;
        }

        output += args.sql.slice(cursor, valuesStart);
        output += repairedRows.join(",");
        cursor = statementEnd;
        changed = true;
        insertPattern.lastIndex = statementEnd + 1;
    }

    if (!changed) return { sql: args.sql, changed: false };

    output += args.sql.slice(cursor);
    return { sql: output, changed: true };
}

function repairSqliteSeedDefaults(args: {
    seed: TopicSeed;
    exercise: CodeInputDraft;
}): { exercise: CodeInputDraft; changed: boolean } {
    const runtimeDefaults = args.seed.moduleRuntimeDefaults;
    const dialect =
        runtimeDefaults?.kind === "sql"
            ? runtimeDefaults.fixedSqlDialect
            : undefined;

    if (dialect !== "sqlite") {
        return { exercise: args.exercise, changed: false };
    }

    const schemaFiles =
        args.exercise.solutionFiles?.length
            ? args.exercise.solutionFiles
            : args.exercise.starterFiles ?? [];
    const schemaSql = schemaFiles
        .filter((file) =>
            normalizeWorkspaceFilePath(file.path)
                .toLowerCase()
                .endsWith("schema.sql"),
        )
        .map((file) => file.content)
        .join("\n");

    if (!schemaSql.trim()) {
        return { exercise: args.exercise, changed: false };
    }

    const defaultsByTable =
        extractSqliteColumnDefaults(schemaSql);
    if (defaultsByTable.size === 0) {
        return { exercise: args.exercise, changed: false };
    }

    let changed = false;
    const repairFiles = (
        files: CodeInputDraft["starterFiles"],
    ): CodeInputDraft["starterFiles"] => {
        if (!files) return files;

        return files.map((file) => {
            if (
                !normalizeWorkspaceFilePath(file.path)
                    .toLowerCase()
                    .endsWith("seed.sql")
            ) {
                return file;
            }

            const repaired = repairSqliteInsertDefaults({
                sql: file.content,
                defaultsByTable,
            });
            if (!repaired.changed) return file;

            changed = true;
            return {
                ...file,
                content: repaired.sql,
            };
        });
    };

    const starterFiles = repairFiles(
        args.exercise.starterFiles,
    );
    const solutionFiles = repairFiles(
        args.exercise.solutionFiles,
    );

    if (!changed) {
        return { exercise: args.exercise, changed: false };
    }

    return {
        exercise: {
            ...args.exercise,
            ...(starterFiles ? { starterFiles } : {}),
            ...(solutionFiles ? { solutionFiles } : {}),
        },
        changed: true,
    };
}

function repairSqlStarter(
    exercise: CodeInputDraft,
): { exercise: CodeInputDraft; changed: boolean } {
    const record = exercise as CodeInputDraft & {
        recipeType?: unknown;
        fixedLanguage?: unknown;
        starterCode?: unknown;
        solutionCode?: unknown;
    };

    const sqlLike =
        record.recipeType === "sql_query" ||
        record.fixedLanguage === "sql";

    if (!sqlLike) return { exercise, changed: false };

    const starter = normalizeSqlForComparison(record.starterCode);
    const solution = normalizeSqlForComparison(record.solutionCode);

    if (!solution || starter !== solution) {
        return { exercise, changed: false };
    }

    return {
        exercise: replaceSqlEntryStarter({
            exercise: record as CodeInputDraft,
            starterCode:
                "-- Write a query that satisfies the exercise prompt.\n",
        }),
        changed: true,
    };
}

export async function repairSqlDraft(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): Promise<{
    draft: TopicAuthoringDraft;
    report: RepairReport;
}> {
    const repairs: RepairReport["repairs"] = [];

    const normalized = args.draft.quizDraft.map((exercise) => {
        if (exercise.kind !== "code_input") return exercise;

        const seedDefaultRepair = repairSqliteSeedDefaults({
            seed: args.seed,
            exercise,
        });
        if (seedDefaultRepair.changed) {
            repairs.push(
                makePolicyRepair({
                    code: "SQLITE_SEED_DEFAULT_VALUE_REPAIRED",
                    field: `quizDraft.${exercise.id}.starterFiles`,
                    severity: "high",
                    message:
                        `Replaced bare DEFAULT values in SQLite seed.sql for "${exercise.id}" with the matching defaults declared in schema.sql.`,
                }),
            );
        }

        const starterRepair = repairSqlStarter(
            seedDefaultRepair.exercise,
        );
        if (starterRepair.changed) {
            repairs.push(
                makePolicyRepair({
                    code: "SQL_STARTER_REVEALED_SOLUTION_REPAIRED",
                    field: `quizDraft.${exercise.id}.starterCode`,
                    severity: "high",
                    message:
                        `Replaced SQL starterCode for "${exercise.id}" because it revealed the complete solution.`,
                }),
            );
        }
        return starterRepair.exercise;
    });

    const plannedCounts = args.seed.plannedExerciseCounts?.counts;
    if (!plannedCounts) {
        return {
            draft: {
                ...args.draft,
                quizDraft: normalized,
            },
            report: {
                topicId: args.seed.topicId,
                repairs,
            },
        };
    }

    const kept: DraftExercise[] = [];
    const keptCounts = Object.fromEntries(
        KIND_ORDER.map((kind) => [kind, 0]),
    ) as Record<ExerciseKindKey, number>;

    for (const exercise of normalized) {
        const kind = exercise.kind as ExerciseKindKey;
        const expected = Math.max(
            0,
            Math.trunc(Number(plannedCounts[kind] ?? 0)),
        );

        if (keptCounts[kind] < expected) {
            kept.push(exercise);
            keptCounts[kind] += 1;
            continue;
        }

        repairs.push(
            makePolicyRepair({
                code: "SQL_EXERCISE_POLICY_KIND_OVER_TARGET_TRIMMED",
                field: "quizDraft",
                severity: "medium",
                message:
                    `Trimmed one extra ${kind} exercise to match the authored per-kind target of ${expected}.`,
            }),
        );
    }

    for (const kind of KIND_ORDER) {
        const expected = Math.max(
            0,
            Math.trunc(Number(plannedCounts[kind] ?? 0)),
        );

        while (keptCounts[kind] < expected) {
            if (kind === "code_input") {
                repairs.push(
                    makePolicyRepair({
                        code: "SQL_EXERCISE_POLICY_CODE_INPUT_FALLBACK_NOT_AVAILABLE",
                        field: "quizDraft",
                        severity: "high",
                        message:
                            `SQL generation is missing code_input ${keptCounts[kind] + 1} of ${expected}; executable SQL recipes must be regenerated rather than invented by policy repair.`,
                    }),
                );
                break;
            }

            const fallback = makeSqlFallbackExercise({
                seed: args.seed,
                kind,
                index: keptCounts[kind] + 1,
            });
            kept.push(fallback);
            keptCounts[kind] += 1;
            repairs.push(
                makePolicyRepair({
                    code: "SQL_EXERCISE_POLICY_KIND_UNDER_TARGET_FILLED",
                    field: "quizDraft",
                    severity: "medium",
                    message:
                        `Added one goal-grounded ${kind} exercise to match the authored per-kind target of ${expected}.`,
                }),
            );
        }
    }

    return {
        draft: {
            ...args.draft,
            quizDraft: kept,
        },
        report: {
            topicId: args.seed.topicId,
            repairs,
        },
    };
}
