import type { ManifestCodeInput, ManifestStarterFile } from "@zoeskoul/curriculum-contracts";
import type {
    CodeInputHelpFallback,
    CodeInputProfileCapability,
    CourseProfile,
} from "../types.js";
import type { PlannedModule } from "@zoeskoul/curriculum-contracts";
import { buildSqlQueryRecipe } from "./recipes/buildSqlQueryRecipe.js";
import { resolveSqlRuntimeDefaults } from "./runtimeDefaults.js";
import { sqlShape } from "../shapes/sqlShape.js";
import {
    messageTag,
    solutionFileContentMessageTag,
    starterFileContentMessageTag,
} from "../shared/messageTags.js";
import {
    buildSqlWorkspaceProgram,
    normalizeSqlWorkspaceFiles,
    resolveSqlEntryFilePath,
    resolveSqlFileOrder,
} from "./shared/sqlWorkspace.js";

function normalizeText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function stripSqlComments(sql: string): string {
    return String(sql ?? "")
        .replace(/--.*$/gm, " ")
        .replace(/\/\*[\s\S]*?\*\//g, " ");
}

function isSqlMutation(sql: string): boolean {
    const cleaned = stripSqlComments(sql).trim().toLowerCase();

    return /(?:^|;)\s*(insert|update|delete|replace|create|drop|alter)\b/.test(cleaned);
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
        /(?:^|;)\s*insert\s+(?:or\s+\w+\s+)?into\s+["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/i,
    );
    if (insertMatch?.[1]) return { tableName: normalizeIdentifier(insertMatch[1]), action: "insert" };

    const replaceMatch = cleaned.match(
        /(?:^|;)\s*replace\s+(?:or\s+\w+\s+)?into\s+["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/i,
    );
    if (replaceMatch?.[1]) return { tableName: normalizeIdentifier(replaceMatch[1]), action: "replace" };

    const updateMatch = cleaned.match(/(?:^|;)\s*update\s+["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/i);
    if (updateMatch?.[1]) return { tableName: normalizeIdentifier(updateMatch[1]), action: "update" };

    const deleteMatch = cleaned.match(
        /(?:^|;)\s*delete\s+from\s+["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/i,
    );
    if (deleteMatch?.[1]) return { tableName: normalizeIdentifier(deleteMatch[1]), action: "delete" };

    const createTableMatch = cleaned.match(
        /(?:^|;)\s*create\s+table\s+(?:if\s+not\s+exists\s+)?["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/i,
    );
    if (createTableMatch?.[1]) {
        return { tableName: normalizeIdentifier(createTableMatch[1]), action: "create_table" };
    }

    const alterTableMatch = cleaned.match(
        /(?:^|;)\s*alter\s+table\s+["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/i,
    );
    if (alterTableMatch?.[1]) {
        return { tableName: normalizeIdentifier(alterTableMatch[1]), action: "alter_table" };
    }

    const dropTableMatch = cleaned.match(
        /(?:^|;)\s*drop\s+table\s+(?:if\s+exists\s+)?["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/i,
    );
    if (dropTableMatch?.[1]) {
        return { tableName: normalizeIdentifier(dropTableMatch[1]), action: "drop_table" };
    }

    return { tableName: null, action: "other" };
}

function inferSqlCheckSql(solutionCode: string): string | undefined {
    if (!isSqlMutation(solutionCode)) return undefined;

    const { tableName, action } = extractMutationTableName(solutionCode);
    if (!tableName) return undefined;

    const quoted = quoteSqliteIdentifier(tableName);
    const tableLiteral = sqlStringLiteral(tableName);

    if (action === "insert" || action === "replace" || action === "update" || action === "delete") {
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

function makeSqlCodeHelpFallback(args: {
    title: string;
    prompt: string;
    seed?: any;
}): CodeInputHelpFallback {
    const task = args.title || args.prompt || "this SQL task";
    const workspaceUi = args.seed?.workspacePolicy?.workspace.ui;
    const editorLabel = workspaceUi?.editorLabel ?? "SQL editor";
    const runButtonLabel = workspaceUi?.runButtonLabel ?? "Run query";
    const resultsLabel =
        workspaceUi?.resultsTableLabel ??
        workspaceUi?.outputPanelLabel ??
        "results table";

    return {
        hint: `Read the task "${task}" and focus on the query pattern you need.`,
        help: {
            concept: `This SQL exercise checks whether your query returns the requested result for: "${task}".`,
            hint_1: `Check the table name and selected columns in the ${editorLabel}.`,
            hint_2: `Click ${runButtonLabel} and compare the ${resultsLabel} with the expected result.`,
        },
    };
}

const sqlCodeInputCapability: CodeInputProfileCapability = {
    defaultStarter() {
        return "-- Write your SQL answer below\n";
    },
    defaultRecipeType() {
        return "sql_query";
    },
    repairDraft(args) {
        const moduleSqlDefaults =
            args.seed.moduleRuntimeDefaults?.kind === "sql"
                ? args.seed.moduleRuntimeDefaults
                : null;
        const datasetId =
            normalizeText(args.exercise.datasetId) ||
            normalizeText(moduleSqlDefaults?.datasetId);

        return {
            ...args.exercise,
            datasetId: datasetId || undefined,
            recipeType: "sql_query",
        };
    },
    getHelpFallback(args) {
        return makeSqlCodeHelpFallback(args);
    },
    buildManifest(args): ManifestCodeInput {
        const moduleRuntimeDefaults =
            args.seed.moduleRuntimeDefaults?.kind === "sql"
                ? args.seed.moduleRuntimeDefaults
                : null;
        const explicitDatasetId = normalizeText(args.exercise.datasetId);
        const moduleDatasetId = normalizeText(moduleRuntimeDefaults?.datasetId);
        const effectiveDatasetId = explicitDatasetId || moduleDatasetId;
        const logicalModuleNumber = Math.max(
            0,
            args.seed.moduleNumber ?? (args.seed.moduleOrder ?? 1) - 1,
        );
        const workspaceExercise =
            args.seed.courseSlug === "sql-data-management" &&
            !normalizeText(args.exercise.entryFilePath)
                ? { ...args.exercise, entryFilePath: "query.sql" }
                : args.exercise;

        if (!effectiveDatasetId) {
            throw new Error(
                `SQL code_input exercise "${args.exercise.id}" is missing an effective datasetId`,
            );
        }

        const rawStarterFiles = normalizeSqlWorkspaceFiles(
            args.exercise.starterFiles,
            `SQL exercise "${args.exercise.id}" starterFiles`,
        );
        const rawSolutionFiles = normalizeSqlWorkspaceFiles(
            args.exercise.solutionFiles,
            `SQL exercise "${args.exercise.id}" solutionFiles`,
        );
        const fileSource = rawStarterFiles.length > 0 ? rawStarterFiles : rawSolutionFiles;
        const entryFilePath = resolveSqlEntryFilePath({
            exercise: workspaceExercise,
            files: fileSource,
        });
        const rawEntryStarter = normalizeText(args.exercise.starterCode);
        const rawEntrySolution = normalizeText(args.exercise.solutionCode);

        const starterFilesBase: ManifestStarterFile[] = rawStarterFiles.length > 0
            ? rawStarterFiles
            : [{
                path: entryFilePath,
                content: rawEntryStarter,
                language: "sql",
                isEntry: true,
                entry: true,
            }];
        const solutionFilesBase: ManifestStarterFile[] = rawSolutionFiles.length > 0
            ? rawSolutionFiles
            : [{
                path: entryFilePath,
                content: rawEntrySolution,
                language: "sql",
                isEntry: true,
                entry: true,
            }];

        const starterPaths = starterFilesBase.map((file) => normalizeText(file.path ?? file.name));
        const solutionPaths = solutionFilesBase.map((file) => normalizeText(file.path ?? file.name));
        const starterEntryContent = normalizeText(
            starterFilesBase.find((file) => normalizeText(file.path ?? file.name) === entryFilePath)?.content,
        );
        const solutionEntryContent = normalizeText(
            solutionFilesBase.find((file) => normalizeText(file.path ?? file.name) === entryFilePath)?.content,
        );
        const isMultiFile =
            starterPaths.length > 1 ||
            solutionPaths.length > 1 ||
            (Array.isArray(args.exercise.sqlFileOrder) && args.exercise.sqlFileOrder.length > 1);

        if (isMultiFile && moduleRuntimeDefaults?.supportsMultiFile !== true) {
            throw new Error(
                `Multi-file SQL exercise "${args.exercise.id}" requires a workspace with supportsMultiFile=true.`,
            );
        }

        if (!starterPaths.includes(entryFilePath) || !solutionPaths.includes(entryFilePath)) {
            throw new Error(
                `SQL exercise "${args.exercise.id}" entryFilePath "${entryFilePath}" must exist in both starterFiles and solutionFiles.`,
            );
        }

        if (rawStarterFiles.length > 0 && starterEntryContent !== rawEntryStarter) {
            throw new Error(
                `SQL exercise "${args.exercise.id}" starterCode must equal the ${entryFilePath} starterFiles content.`,
            );
        }
        if (rawSolutionFiles.length > 0 && solutionEntryContent !== rawEntrySolution) {
            throw new Error(
                `SQL exercise "${args.exercise.id}" solutionCode must equal the ${entryFilePath} solutionFiles content.`,
            );
        }

        const starterPathSet = new Set(starterPaths);
        const solutionPathSet = new Set(solutionPaths);
        const missingStarterPaths = solutionPaths.filter((path) => !starterPathSet.has(path));
        const missingSolutionPaths = starterPaths.filter((path) => !solutionPathSet.has(path));
        if (missingStarterPaths.length > 0 || missingSolutionPaths.length > 0) {
            throw new Error(
                [
                    `SQL exercise "${args.exercise.id}" starterFiles and solutionFiles must describe the same complete workspace.`,
                    missingStarterPaths.length
                        ? `Missing from starterFiles: ${missingStarterPaths.join(", ")}.`
                        : "",
                    missingSolutionPaths.length
                        ? `Missing from solutionFiles: ${missingSolutionPaths.join(", ")}.`
                        : "",
                ]
                    .filter(Boolean)
                    .join(" "),
            );
        }

        const fileOrder = resolveSqlFileOrder({
            exerciseId: args.exercise.id,
            authoredOrder: args.exercise.sqlFileOrder,
            files: solutionFilesBase,
            entryFilePath,
        });

        if (args.seed.courseSlug === "sql-data-management") {
            const expectedPaths = logicalModuleNumber <= 1
                ? ["query.sql"]
                : logicalModuleNumber === 2
                    ? ["schema.sql", "query.sql"]
                    : ["schema.sql", "seed.sql", "query.sql"];
            const samePaths =
                expectedPaths.length === solutionPaths.length &&
                expectedPaths.every((path) => solutionPathSet.has(path));

            const allowedEntryPaths =
                logicalModuleNumber <= 1
                    ? ["query.sql"]
                    : expectedPaths;
            const hasAllowedEntryPath =
                allowedEntryPaths.includes(entryFilePath);

            if (!samePaths || !hasAllowedEntryPath) {
                throw new Error(
                    `SQL Data Management module ${logicalModuleNumber} exercise "${args.exercise.id}" must use ${expectedPaths.join(", ")} with entryFilePath set to the learner-edited file (${allowedEntryPaths.join(", ")}).`,
                );
            }

            if (expectedPaths.length > 1 && fileOrder.join("|") !== expectedPaths.join("|")) {
                throw new Error(
                    `SQL Data Management module ${logicalModuleNumber} exercise "${args.exercise.id}" must use sqlFileOrder ${expectedPaths.join(" -> ")}.`,
                );
            }
        }

        const solutionProgram = isMultiFile
            ? buildSqlWorkspaceProgram({
                files: solutionFilesBase,
                fileOrder,
            })
            : solutionEntryContent || rawEntrySolution;
        const explicitCheckSql = normalizeText(args.exercise.checkSql);
        const inferredCheckSql = inferSqlCheckSql(solutionProgram);
        const checkSql = explicitCheckSql || inferredCheckSql;

        if (isSqlMutation(solutionProgram) && !checkSql) {
            throw new Error(
                [
                    `SQL mutation code_input exercise "${args.exercise.id}" needs checkSql.`,
                    `Topic: ${args.seed.topicId}`,
                    `Solution contains a mutation or DDL statement, but the compiler could not infer a safe post-check query.`,
                    `Add "checkSql" to the TopicAuthoringDraft code_input item.`,
                ].join("\n"),
            );
        }

        const starterCode = messageTag(args.messageBase, "starterCode");
        const solutionCode = messageTag(args.messageBase, "solutionCode");
        const starterFiles = starterFilesBase.map((file, index) => {
            const path = normalizeText(file.path ?? file.name);
            const isEntry = path === entryFilePath;
            return {
                ...file,
                path,
                language: "sql" as const,
                content: isEntry
                    ? starterCode
                    : starterFileContentMessageTag({
                        messageBase: args.messageBase,
                        filePath: path,
                        index,
                    }),
                ...(isEntry ? { isEntry: true, entry: true } : { isEntry: false, entry: false }),
            };
        });
        const solutionFiles = solutionFilesBase.map((file, index) => {
            const path = normalizeText(file.path ?? file.name);
            const isEntry = path === entryFilePath;
            return {
                ...file,
                path,
                language: "sql" as const,
                content: isEntry
                    ? solutionCode
                    : solutionFileContentMessageTag({
                        messageBase: args.messageBase,
                        filePath: path,
                        index,
                    }),
                ...(isEntry ? { isEntry: true, entry: true } : { isEntry: false, entry: false }),
            };
        });

        return {
            id: args.exercise.id,
            kind: "code_input",
            purpose: "project",
            weight: 1,
            messageBase: args.messageBase,
            language: "sql",
            starterCode,
            starterFiles,
            solutionFiles,
            fixedSqlDialect: moduleRuntimeDefaults?.fixedSqlDialect ?? "sqlite",
            runtime: {
                kind: "sql",
                datasetId: effectiveDatasetId,
                fixedSqlDialect: moduleRuntimeDefaults?.fixedSqlDialect ?? "sqlite",
                resultShape: moduleRuntimeDefaults?.resultShape ?? "table",
                showSchema: moduleRuntimeDefaults?.showSchema ?? true,
                showErd: moduleRuntimeDefaults?.showErd,
                showChen: moduleRuntimeDefaults?.showChen,
                supportsTerminal: moduleRuntimeDefaults?.supportsTerminal ?? false,
                supportsMultiFile: moduleRuntimeDefaults?.supportsMultiFile ?? false,
                supportsFileSystem: moduleRuntimeDefaults?.supportsFileSystem ?? false,
            },
            workspace: {
                language: "sql",
                entryFilePath,
                entryFile: entryFilePath,
                openTabs: fileOrder,
                starterCode,
                starterFiles,
            },
            recipe: {
                type: "sql_query",
                datasetId: effectiveDatasetId,
                resultShape: moduleRuntimeDefaults?.resultShape ?? "table",
                solutionCode: solutionProgram,
                solutionFiles,
                ...(isMultiFile ? { sqlFileOrder: fileOrder } : {}),
                ...(checkSql ? { checkSql } : {}),
            },
        };
    },
};


export { getSqlModuleDataset, getSqlModuleDatasetPolicy } from "./datasetPolicy.js";

export const sqlProfile: CourseProfile = {
    id: "sql",
    shape: sqlShape,
    runtimeKind: "sql",
    defaultLanguage: "sql",
    defaultEntryFileName: "main.sql",
    resolveExpectedEntryFileName(args) {
        if (args.seed.courseSlug !== "sql-data-management") {
            return "main.sql";
        }

        const logicalModuleNumber = Math.max(
            0,
            args.seed.moduleNumber ??
                (args.seed.moduleOrder ?? 1) - 1,
        );
        if (logicalModuleNumber <= 1) {
            return "query.sql";
        }

        return (
            normalizeText(
                args.exercise.workspace?.entryFilePath,
            ) || "query.sql"
        );
    },
    allowedExerciseKinds: [
        "single_choice",
        "multi_choice",
        "drag_reorder",
        "fill_blank_choice",
        "code_input",
    ],
    allowedRecipeTypes: ["fixed_tests", "template_io", "sql_query"],
    buildModuleRuntimeDefaults(moduleOrder?: number, module?: PlannedModule) {
        return resolveSqlRuntimeDefaults({
            moduleOrder,
            module,
        });
    },
    renderExerciseKindPromptRules(args) {
        const supportsMultiFile =
            args.seed.moduleRuntimeDefaults?.kind === "sql" &&
            args.seed.moduleRuntimeDefaults.supportsMultiFile === true;
        const isDataManagement = args.seed.courseSlug === "sql-data-management";
        const logicalModuleNumber = Math.max(
            0,
            args.seed.moduleNumber ?? (args.seed.moduleOrder ?? 1) - 1,
        );
        const baseRules = [
            '- For SQL code_input, recipeType must be "sql_query".',
            "- For SQL code_input, use datasetId overrides only when the exercise runtime truly needs them.",
            "- For SQL code_input, mutation and DDL statements must include result-returning checkSql so the final database state can be verified.",
            "- For SQL code_input, do not invent tables or columns outside the grounded dataset or exercise-created schema.",
        ];

        if (isDataManagement && logicalModuleNumber <= 1) {
            return [
                ...baseRules,
                "- This SQL Data Management module uses exactly one learner-editable file named query.sql.",
                '- Set entryFilePath to "query.sql".',
                "- starterCode and solutionCode are complete snapshots of query.sql.",
                "- If starterFiles or solutionFiles are emitted, each array must contain only query.sql and its content must match starterCode or solutionCode.",
                "- Keep preview SELECT, mutation, and verification SELECT statements together in query.sql.",
                "- For progressive steps, carry the previous complete query.sql solution forward and add only the next focused change.",
            ];
        }

        if (isDataManagement && supportsMultiFile) {
            const expectedFiles = logicalModuleNumber === 2
                ? ["schema.sql", "query.sql"]
                : ["schema.sql", "seed.sql", "query.sql"];

            return [
                ...baseRules,
                "- This SQL Data Management topic uses an ordered multi-file SQL workspace.",
                `- Emit exactly these files in both starterFiles and solutionFiles: ${expectedFiles.join(", ")}.`,
                ...(logicalModuleNumber === 2
                    ? [
                        "- Module 2 is hands-on schema practice. Set entryFilePath to schema.sql.",
                        "- Never provide the completed target table or completed constraint change in starterFiles/schema.sql.",
                        "- starterFiles/schema.sql must contain genuine unfinished learner work and differ meaningfully from solutionFiles/schema.sql after comments and whitespace are ignored.",
                        "- starterFiles/query.sql must also remain unfinished; the learner writes the SELECT or PRAGMA inspection.",
                        "- A foreign-key lesson may provide completed parent tables, but label them as provided setup and leave the new child table absent from the starter.",
                        "- The prompt must state exactly what belongs in schema.sql and what belongs in query.sql.",
                      ]
                    : []),
                "- Set entryFilePath to the one file the learner changes in this exercise and mark only that file as the entry file.",
                "- Use schema.sql as entryFilePath for table-definition or constraint steps.",
                ...(expectedFiles.includes("seed.sql")
                    ? ["- Use seed.sql as entryFilePath for approved starting-data steps."]
                    : []),
                "- Use query.sql as entryFilePath for inspection, mutation, cleanup, or verification steps.",
                `- Set sqlFileOrder to ${JSON.stringify(expectedFiles)}.`,
                "- starterCode and solutionCode must equal the active entry file's starter and solution content; the compiler builds the complete graded SQL program from solutionFiles in sqlFileOrder.",
                "- schema.sql owns complete CREATE TABLE definitions.",
                ...(expectedFiles.includes("seed.sql")
                    ? ["- seed.sql owns approved starting INSERT statements."]
                    : []),
                "- query.sql owns learner-visible inspection, mutation, cleanup, and verification statements.",
                "- Every progressive step must emit a complete workspace snapshot. Later starterFiles carry forward the previous solutionFiles, with only the active entry file containing the new step scaffold.",
                "- Do not concatenate historical workspace snapshots or place multiple alternative schemas in one file.",
            ];
        }

        if (supportsMultiFile) {
            return [
                ...baseRules,
                "- This topic uses an ordered multi-file SQL workspace.",
                "- Emit complete starterFiles and solutionFiles arrays with identical path sets.",
                "- Set an explicit entryFilePath and include every SQL file exactly once in sqlFileOrder.",
                "- Keep starterCode and solutionCode synchronized with the entry-file contents.",
                "- The compiler and runtime execute the files in sqlFileOrder.",
                "- Progressive steps must carry the complete previous workspace forward.",
            ];
        }

        return [
            ...baseRules,
            "- For progressive single-file SQL projects and capstones, every later starterCode must begin from the previous step's complete solutionCode.",
            "- Every later solutionCode must be one complete cumulative SQL script that preserves the earlier working behavior.",
            "- Never concatenate historical alternative SELECT answers merely to represent project history.",
        ];
    },
    renderAuthoringPromptRules(args) {
        return [
            "SQL dataset grounding rules:",
            "- Use seed.moduleRuntimeDefaults.datasetId as the default dataset for the whole topic.",
            "- All SQL examples in sketch bodyMarkdown must use tables and columns from the grounded module dataset.",
            "- Sketches must never switch to an exercise dataset override.",
            "- Only code_input exercises may declare a datasetId override.",
            "- If a code_input exercise overrides datasetId, that override applies only to that exercise runtime.",
            "- Do not invent table names or columns.",
            "- Do not use generic textbook placeholders unless they exist in the grounded schema.",
            "- Use only approved SQL datasetIds from the shape pack.",
            "",
            "The seed may include moduleDataset.",
            "Use its schema, table names, columns, and sample rows to design examples and exercises that fit the real dataset.",
            "",
            ...(args.seed.moduleRuntimeDefaults?.kind === "sql" &&
            args.seed.moduleRuntimeDefaults.supportsMultiFile === true
                ? [
                    "Ordered SQL workspace rules:",
                    "- Author complete starterFiles and solutionFiles arrays; do not rely on starterCode and solutionCode alone.",
                    "- Set an explicit entryFilePath and include every SQL file exactly once in sqlFileOrder.",
                    "- Keep starterCode and solutionCode synchronized with the entry-file contents.",
                    "- The compiler and runtime concatenate files in sqlFileOrder for execution and grading.",
                    "- Progressive project steps carry the complete file workspace forward.",
                    "",
                ]
                : args.seed.courseSlug === "sql-data-management"
                    ? [
                        "SQL Data Management single-file rules:",
                        "- Use exactly one file named query.sql and set entryFilePath to query.sql.",
                        "- Keep each step as one complete cumulative query.sql script.",
                        "",
                    ]
                    : []),
            "For SQL relationship/join topics:",
            "- If the module dataset does not contain two related tables, do not generate SELECT JOIN code_input exercises.",
            "- If teaching relationships with a single-table dataset, use conceptual quiz questions or CREATE TABLE schema-design exercises with checkSql.",
            "- Never invent tables like orders, customers, enrollments, or order_items unless they exist in moduleDataset.schemaSql or the exercise itself creates them.",
            "- SQL code_input exercises that use SELECT do not need checkSql.",
            "- SQL code_input exercises that use INSERT, UPDATE, DELETE, REPLACE, CREATE, ALTER, or DROP should include checkSql.",
            "- checkSql must be a SELECT-style query that verifies the final database state after the statement runs.",
            "- For CREATE TABLE or ALTER TABLE, checkSql can query sqlite_master to verify the table definition.",
            "- Sketch SQL examples must use the module dataset, not an exercise dataset.",
        ];
    },
    codeInput: sqlCodeInputCapability,

    getRecipeRegistry() {
        return { sql_query: buildSqlQueryRecipe };
    },

    validateTopicBundle(bundle) {
        if (!bundle || typeof bundle !== "object") {
            return ["ERROR: topicBundle is missing or invalid"];
        }

        if (!Array.isArray(bundle.cards)) {
            return ["ERROR: topicBundle.cards must be an array"];
        }

        if (!Array.isArray(bundle.sketches)) {
            return ["ERROR: topicBundle.sketches must be an array"];
        }

        if (!Array.isArray(bundle.exercises)) {
            return ["ERROR: topicBundle.exercises must be an array"];
        }

        const issues: string[] = [];
        for (const ex of bundle.exercises) {
            if (
                ex?.kind === "code_input" &&
                ex?.recipe?.type === "sql_query" &&
                !ex?.recipe?.datasetId
            ) {
                issues.push(`ERROR: Exercise ${ex.id} is missing datasetId`);
            }
        }

        return issues;
    },
};
