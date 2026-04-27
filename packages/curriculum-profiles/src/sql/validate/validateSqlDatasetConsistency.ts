// packages/curriculum-profiles/src/sql/validate/validateSqlDatasetConsistency.ts

import type {
    SqlDatasetArtifact,
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import { getSqlDataset } from "../datasets/index.js";
import {
    prepareSqlForExistingColumnReferenceScan,
    stripSqlComments,
    stripSqlCommentsAndStrings, stripSqlStringLiterals,
} from "../shared/sqlReferenceScan.js";
const SQL_KEYWORDS = new Set([
    // Query
    "select",
    "from",
    "where",
    "and",
    "or",
    "not",
    "as",
    "group",
    "by",
    "order",
    "having",
    "limit",
    "offset",
    "distinct",
    "asc",
    "desc",

    // Joins
    "join",
    "inner",
    "left",
    "right",
    "full",
    "outer",
    "cross",
    "on",
    "current_date",
    "current_time",
    "current_timestamp",
    "autoincrement",
    "default",
    // Conditions
    "is",
    "null",
    "between",
    "in",
    "like",
    "glob",
    "exists",

    // CASE
    "case",
    "when",
    "then",
    "else",
    "end",

    // Set operations / CTE
    "union",
    "all",
    "intersect",
    "except",
    "with",
    "recursive",

    // Window
    "over",
    "partition",
    "rows",
    "range",
    "current",
    "row",
    "preceding",
    "following",
    "unbounded",

    // Literals / expressions
    "true",
    "false",
    "cast",
    "collate",

    // INSERT / UPDATE / DELETE
    "insert",
    "into",
    "values",
    "value",
    "default",
    "update",
    "set",
    "delete",
    "returning",

    // SQLite UPSERT / conflict handling
    "conflict",
    "replace",
    "ignore",
    "abort",
    "fail",
    "rollback",
    "do",
    "nothing",
    "excluded",

    // DDL, useful if beginner lessons include schema examples
    "create",
    "table",
    "if",
    "primary",
    "key",
    "foreign",
    "references",
    "constraint",
    "unique",
    "check",
    "drop",
    "alter",
    "add",
    "column",
]);

const SQL_TYPE_NAMES = new Set([
    "integer",
    "int",
    "real",
    "numeric",
    "decimal",
    "float",
    "double",
    "text",
    "varchar",
    "char",
    "boolean",
    "date",
    "datetime",
    "timestamp",
    "blob",
]);

const SQL_FUNCTION_NAMES = new Set([
    // Aggregates
    "avg",
    "count",
    "sum",
    "min",
    "max",
    "total",
    "group_concat",

    // SQLite date/time
    "date",
    "time",
    "datetime",
    "julianday",
    "unixepoch",
    "strftime",
    "timediff",
    "current_date",
    "current_time",
    "current_timestamp",
    // SQLite scalar/string
    "abs",
    "changes",
    "char",
    "coalesce",
    "concat",
    "concat_ws",
    "format",
    "glob",
    "hex",
    "ifnull",
    "iif",
    "instr",
    "last_insert_rowid",
    "length",
    "like",
    "likely",
    "likelihood",
    "lower",
    "ltrim",
    "max",
    "min",
    "nullif",
    "printf",
    "quote",
    "random",
    "randomblob",
    "replace",
    "round",
    "rtrim",
    "sign",
    "soundex",
    "sqlite_compileoption_get",
    "sqlite_compileoption_used",
    "sqlite_offset",
    "sqlite_source_id",
    "sqlite_version",
    "substr",
    "substring",
    "trim",
    "typeof",
    "unicode",
    "unlikely",
    "upper",
    "zeroblob",

    // Common math funcs supported in many SQLite builds
    "acos",
    "acosh",
    "asin",
    "asinh",
    "atan",
    "atan2",
    "atanh",
    "ceil",
    "ceiling",
    "cos",
    "cosh",
    "degrees",
    "exp",
    "floor",
    "ln",
    "log",
    "log10",
    "log2",
    "mod",
    "pi",
    "pow",
    "power",
    "radians",
    "sin",
    "sinh",
    "sqrt",
    "tan",
    "tanh",
    "trunc",

    // Window functions
    "row_number",
    "rank",
    "dense_rank",
    "percent_rank",
    "cume_dist",
    "ntile",
    "lag",
    "lead",
    "first_value",
    "last_value",
    "nth_value",
    "unique",
    // DDL, useful if beginner lessons include schema examples
    "create",
    "table",
    "if",
    "primary",
    "key",
    "foreign",
    "references",
    "constraint",
    "unique",
    "check",
    "drop",
    "alter",
    "add",
    "column",
    "rename",
    "to",
    "create",
    "table",
    "if",
    "primary",
    "key",
    "foreign",
    "references",
    "constraint",
    "unique",
    "check",
    "drop",
    "alter",
    "add",
    "column",
    "rename",
    "to",
    "autoincrement",
]);

type DatasetShape = {
    id: string;
    tableNames: Set<string>;
    columnNames: Set<string>;
};

function normalizeIdentifier(value: string | undefined | null): string {
    return (value ?? "")
        .trim()
        .replace(/^["'`\[]+/, "")
        .replace(/["'`\]]+$/, "")
        .toLowerCase();
}






function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isSqlFunctionReference(sql: string, identifier: string): boolean {
    const normalized = normalizeIdentifier(identifier);
    if (!normalized) return false;

    const pattern = new RegExp(`\\b${escapeRegExp(normalized)}\\s*\\(`, "i");
    return pattern.test(sql);
}

function extractIdentifiers(sql: string): string[] {
    const cleaned = stripSqlCommentsAndStrings(sql);
    const identifiers = cleaned.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) ?? [];

    return Array.from(
        new Set(
            identifiers
                .map(normalizeIdentifier)
                .filter((identifier) => identifier.length > 0),
        ),
    );
}

function extractAliases(sql: string): Set<string> {
    const cleaned = stripSqlCommentsAndStrings(sql);
    const aliases = new Set<string>();

    const asAliasPattern = /\bas\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/gi;
    for (const match of cleaned.matchAll(asAliasPattern)) {
        aliases.add(normalizeIdentifier(match[1]));
    }

    const tableAliasPattern =
        /\b(?:from|join)\s+["'`]?(?<table>[a-zA-Z_][a-zA-Z0-9_]*)["'`]?(?:\s+(?:as\s+)?(?<alias>[a-zA-Z_][a-zA-Z0-9_]*))?/gi;

    for (const match of cleaned.matchAll(tableAliasPattern)) {
        const alias = normalizeIdentifier(match.groups?.alias);
        if (alias && !SQL_KEYWORDS.has(alias)) {
            aliases.add(alias);
        }
    }

    return aliases;
}

function parseColumnsFromCreateTable(schemaSql: string): Set<string> {
    const columns = new Set<string>();
    const cleaned = stripSqlComments(schemaSql);

    const createTablePattern =
        /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?["'`]?[a-zA-Z_][a-zA-Z0-9_]*["'`]?\s*\(([\s\S]*?)\)\s*;?/gi;

    for (const tableMatch of cleaned.matchAll(createTablePattern)) {
        const body = tableMatch[1] ?? "";
        const parts = body.split(",");

        for (const rawPart of parts) {
            const part = rawPart.trim();
            if (!part) continue;

            const firstToken = normalizeIdentifier(part.split(/\s+/)[0]);

            if (!firstToken) continue;

            if (
                firstToken === "primary" ||
                firstToken === "foreign" ||
                firstToken === "unique" ||
                firstToken === "check" ||
                firstToken === "constraint"
            ) {
                continue;
            }

            columns.add(firstToken);
        }
    }

    return columns;
}

function parseTablesFromCreateTable(schemaSql: string): Set<string> {
    const tables = new Set<string>();
    const cleaned = stripSqlComments(schemaSql);

    const createTablePattern =
        /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?["'`]?(?<table>[a-zA-Z_][a-zA-Z0-9_]*)["'`]?/gi;

    for (const match of cleaned.matchAll(createTablePattern)) {
        const table = normalizeIdentifier(match.groups?.table);
        if (table) tables.add(table);
    }

    return tables;
}

function validateCreateTableConflicts(args: {
    exerciseId: string;
    sql: string;
    datasetShape: DatasetShape;
}): string[] {
    const messages: string[] = [];
    const createdTableNames = parseTablesFromCreateTable(args.sql);

    for (const tableName of createdTableNames) {
        if (!args.datasetShape.tableNames.has(tableName)) continue;

        messages.push(
            `Exercise ${args.exerciseId} creates table "${tableName}" even though it already exists in effective dataset "${args.datasetShape.id}"`,
        );
    }

    return messages;
}

function datasetToShape(dataset: SqlDatasetArtifact): DatasetShape {
    const tableNames = new Set<string>();
    const columnNames = new Set<string>();

    const schemaSql = "schemaSql" in dataset ? String(dataset.schemaSql ?? "") : "";

    for (const tableName of parseTablesFromCreateTable(schemaSql)) {
        tableNames.add(tableName);
    }

    for (const columnName of parseColumnsFromCreateTable(schemaSql)) {
        columnNames.add(columnName);
    }

    const tableSnapshots = Array.isArray(dataset.tableSnapshots)
        ? dataset.tableSnapshots
        : [];

    for (const snapshot of tableSnapshots) {
        const tableName = normalizeIdentifier(snapshot.tableName);
        if (tableName) tableNames.add(tableName);

        const columns = Array.isArray(snapshot.columns) ? snapshot.columns : [];
        for (const column of columns) {
            const columnName = normalizeIdentifier(String(column));
            if (columnName) columnNames.add(columnName);
        }
    }

    return {
        id: String(dataset.id),
        tableNames,
        columnNames,
    };
}

function getEffectiveDataset(args: {
    seed: TopicSeed;
    exerciseDatasetId?: string;
}): SqlDatasetArtifact | null {
    const exerciseDatasetId = args.exerciseDatasetId?.trim();
    const moduleDatasetId =
        args.seed.moduleRuntimeDefaults?.kind === "sql"
            ? args.seed.moduleRuntimeDefaults.datasetId?.trim()
            : undefined;

    const seedDataset = args.seed.moduleDataset ?? null;
    const datasetId = exerciseDatasetId || moduleDatasetId || seedDataset?.id;

    if (!datasetId) return seedDataset;

    if (seedDataset?.id === datasetId) {
        return seedDataset;
    }

    return getSqlDataset(datasetId);
}

function shouldIgnoreIdentifier(args: {
    sql: string;
    identifier: string;
    datasetShape: DatasetShape;
    aliases: Set<string>;
}): boolean {
    const identifier = normalizeIdentifier(args.identifier);

    if (!identifier) return true;

    if (SQL_KEYWORDS.has(identifier)) return true;
    if (SQL_TYPE_NAMES.has(identifier)) return true;
    if (SQL_FUNCTION_NAMES.has(identifier)) return true;
    if (args.aliases.has(identifier)) return true;
    if (args.datasetShape.tableNames.has(identifier)) return true;

    if (isSqlFunctionReference(args.sql, identifier)) return true;

    return false;
}
function mergeExerciseCreatedSchema(args: {
    datasetShape: DatasetShape;
    sql: string;
}): DatasetShape {
    const createdTableNames = parseTablesFromCreateTable(args.sql);
    const createdColumnNames = parseColumnsFromCreateTable(args.sql);

    const insertColumnsForCreatedTables = parseInsertColumnsForCreatedTables({
        sql: args.sql,
        createdTableNames,
    });

    return {
        id: args.datasetShape.id,
        tableNames: new Set([
            ...args.datasetShape.tableNames,
            ...createdTableNames,
        ]),
        columnNames: new Set([
            ...args.datasetShape.columnNames,
            ...createdColumnNames,
            ...insertColumnsForCreatedTables,
        ]),
    };
}function parseInsertColumnsForCreatedTables(args: {
    sql: string;
    createdTableNames: Set<string>;
}): Set<string> {
    const columns = new Set<string>();
    const cleaned = stripSqlCommentsAndStrings(args.sql);

    const insertPattern =
        /\binsert\s+into\s+["'`]?(?<table>[a-zA-Z_][a-zA-Z0-9_]*)["'`]?\s*\((?<columns>[^)]*)\)/gi;

    for (const match of cleaned.matchAll(insertPattern)) {
        const tableName = normalizeIdentifier(match.groups?.table);

        if (!tableName || !args.createdTableNames.has(tableName)) {
            continue;
        }

        const columnList = String(match.groups?.columns ?? "");

        for (const rawColumn of columnList.split(",")) {
            const columnName = normalizeIdentifier(rawColumn);

            if (columnName) {
                columns.add(columnName);
            }
        }
    }

    return columns;
}
function validateSqlExerciseAgainstDataset(args: {
    exerciseId: string;
    sql: string;
    dataset: SqlDatasetArtifact;
}): string[] {
    const messages: string[] = [];

    const baseDatasetShape = datasetToShape(args.dataset);

    messages.push(
        ...validateCreateTableConflicts({
            exerciseId: args.exerciseId,
            sql: args.sql,
            datasetShape: baseDatasetShape,
        }),
    );

    const datasetShape = mergeExerciseCreatedSchema({
        datasetShape: baseDatasetShape,
        sql: args.sql,
    });

    const sqlForReferenceScan = prepareSqlForExistingColumnReferenceScan(args.sql);

    const aliases = extractAliases(sqlForReferenceScan);
    const identifiers = extractIdentifiers(sqlForReferenceScan);

    for (const identifier of identifiers) {
        if (
            shouldIgnoreIdentifier({
                sql: sqlForReferenceScan,
                identifier,
                datasetShape,
                aliases,
            })
        ) {
            continue;
        }

        if (datasetShape.columnNames.has(identifier)) {
            continue;
        }

        messages.push(
            `Exercise ${args.exerciseId} references column "${identifier}" that does not belong to effective dataset "${datasetShape.id}"`,
        );
    }

    return messages;
}

export function validateSqlDatasetConsistency(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): string[] {
    const messages: string[] = [];

    for (const exercise of args.draft.quizDraft) {
        if (exercise.kind !== "code_input") continue;

        const recipeType = exercise.recipeType ?? "sql_query";
        if (recipeType !== "sql_query") continue;

        const sql = exercise.solutionCode?.trim();
        if (!sql) continue;

        const dataset = getEffectiveDataset({
            seed: args.seed,
            exerciseDatasetId: exercise.datasetId,
        });

        if (!dataset) {
            messages.push(
                `Exercise ${exercise.id} does not have an effective SQL dataset.`,
            );
            continue;
        }

        messages.push(
            ...validateSqlExerciseAgainstDataset({
                exerciseId: exercise.id,
                sql,
                dataset,
            }),
        );
    }

    return messages;
}
