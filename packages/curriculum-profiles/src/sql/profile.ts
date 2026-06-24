import type { ManifestCodeInput } from "@zoeskoul/curriculum-contracts";
import type {
    CodeInputHelpFallback,
    CodeInputProfileCapability,
    CourseProfile,
} from "../types.js";
import type { PlannedModule } from "@zoeskoul/curriculum-contracts";
import { buildSqlQueryRecipe } from "./recipes/buildSqlQueryRecipe.js";
import { resolveSqlRuntimeDefaults } from "./runtimeDefaults.js";
import { sqlShape } from "../shapes/sqlShape.js";
import { messageTag } from "../shared/messageTags.js";

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
    if (insertMatch?.[1]) return { tableName: normalizeIdentifier(insertMatch[1]), action: "insert" };

    const replaceMatch = cleaned.match(
        /^\s*replace\s+(?:or\s+\w+\s+)?into\s+["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/i,
    );
    if (replaceMatch?.[1]) return { tableName: normalizeIdentifier(replaceMatch[1]), action: "replace" };

    const updateMatch = cleaned.match(/^\s*update\s+["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/i);
    if (updateMatch?.[1]) return { tableName: normalizeIdentifier(updateMatch[1]), action: "update" };

    const deleteMatch = cleaned.match(
        /^\s*delete\s+from\s+["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/i,
    );
    if (deleteMatch?.[1]) return { tableName: normalizeIdentifier(deleteMatch[1]), action: "delete" };

    const createTableMatch = cleaned.match(
        /^\s*create\s+table\s+(?:if\s+not\s+exists\s+)?["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/i,
    );
    if (createTableMatch?.[1]) {
        return { tableName: normalizeIdentifier(createTableMatch[1]), action: "create_table" };
    }

    const alterTableMatch = cleaned.match(
        /^\s*alter\s+table\s+["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/i,
    );
    if (alterTableMatch?.[1]) {
        return { tableName: normalizeIdentifier(alterTableMatch[1]), action: "alter_table" };
    }

    const dropTableMatch = cleaned.match(
        /^\s*drop\s+table\s+(?:if\s+exists\s+)?["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/i,
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

        if (!effectiveDatasetId) {
            throw new Error(
                `SQL code_input exercise "${args.exercise.id}" is missing an effective datasetId`,
            );
        }

        const solutionCode = normalizeText(args.exercise.solutionCode);
        const explicitCheckSql = normalizeText(args.exercise.checkSql);
        const inferredCheckSql = inferSqlCheckSql(solutionCode);
        const checkSql = explicitCheckSql || inferredCheckSql;

        if (isSqlMutation(solutionCode) && !checkSql) {
            throw new Error(
                [
                    `SQL mutation code_input exercise "${args.exercise.id}" needs checkSql.`,
                    `Topic: ${args.seed.topicId}`,
                    `Solution starts with a mutation statement, but the compiler could not infer a safe post-check query.`,
                    `Add "checkSql" to the TopicAuthoringDraft code_input item.`,
                ].join("\n"),
            );
        }

        const starterCode = messageTag(args.messageBase, "starterCode");

        return {
            id: args.exercise.id,
            kind: "code_input",
            purpose: "project",
            weight: 1,
            messageBase: args.messageBase,
            language: "sql",
            starterCode,
            fixedSqlDialect: moduleRuntimeDefaults?.fixedSqlDialect ?? "sqlite",
            runtime: {
                kind: "sql",
                datasetId: effectiveDatasetId,
                fixedSqlDialect: moduleRuntimeDefaults?.fixedSqlDialect ?? "sqlite",
                resultShape: moduleRuntimeDefaults?.resultShape ?? "table",
                showSchema: moduleRuntimeDefaults?.showSchema ?? true,
                showErd: moduleRuntimeDefaults?.showErd,
                showChen: moduleRuntimeDefaults?.showChen,
                supportsTerminal: false,
                supportsMultiFile: false,
                supportsFileSystem: false,
            },
            workspace: {
                language: "sql",
                entryFilePath: "main.sql",
                starterCode,
                starterFiles: [
                    {
                        path: "main.sql",
                        content: starterCode,
                        language: "sql",
                        isEntry: true,
                        entry: true,
                    },
                ],
            },
            recipe: {
                type: "sql_query",
                datasetId: effectiveDatasetId,
                resultShape: moduleRuntimeDefaults?.resultShape ?? "table",
                solutionCode,
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
    renderExerciseKindPromptRules() {
        return [
            '- For SQL code_input, recipeType must be "sql_query".',
            "- For SQL code_input, use datasetId overrides only when the exercise runtime truly needs them.",
            "- For SQL code_input, mutation statements should include checkSql so the final database state can be verified.",
            "- For SQL code_input, do not invent tables or columns outside the grounded dataset or exercise-created schema.",
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
