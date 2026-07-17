import type {
    SqlDatasetArtifact,
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import { getSqlDataset } from "../datasets/index.js";
import {
    prepareSqlForExistingColumnReferenceScan,
    stripSqlComments,
    stripSqlCommentsAndStrings,
} from "../shared/sqlReferenceScan.js";
import { collectSqlDraftSources } from "../shared/sqlWorkspace.js";

const SQL_KEYWORDS = new Set([
    "add",
    "all",
    "alter",
    "and",
    "as",
    "asc",
    "autoincrement",
    "between",
    "by",
    "case",
    "cast",
    "check",
    "collate",
    "column",
    "constraint",
    "create",
    "cross",
    "current",
    "current_date",
    "current_time",
    "current_timestamp",
    "default",
    "delete",
    "desc",
    "distinct",
    "do",
    "drop",
    "else",
    "end",
    "except",
    "exists",
    "fail",
    "following",
    "foreign",
    "from",
    "full",
    "glob",
    "group",
    "having",
    "if",
    "ignore",
    "in",
    "inner",
    "insert",
    "intersect",
    "into",
    "is",
    "join",
    "key",
    "left",
    "like",
    "limit",
    "not",
    "null",
    "offset",
    "on",
    "or",
    "order",
    "outer",
    "over",
    "partition",
    "preceding",
    "primary",
    "range",
    "recursive",
    "references",
    "rename",
    "replace",
    "returning",
    "right",
    "rollback",
    "row",
    "rows",
    "select",
    "set",
    "table",
    "then",
    "to",
    "true",
    "union",
    "unique",
    "unbounded",
    "update",
    "using",
    "value",
    "values",
    "when",
    "where",
    "with",
]);

const SQL_TYPE_NAMES = new Set([
    "blob",
    "boolean",
    "char",
    "date",
    "datetime",
    "decimal",
    "double",
    "float",
    "int",
    "integer",
    "numeric",
    "real",
    "text",
    "timestamp",
    "varchar",
]);

const SQL_FUNCTION_NAMES = new Set([
    "abs",
    "avg",
    "char",
    "coalesce",
    "concat",
    "concat_ws",
    "count",
    "current_date",
    "current_time",
    "current_timestamp",
    "date",
    "datetime",
    "first_value",
    "format",
    "group_concat",
    "hex",
    "ifnull",
    "instr",
    "julianday",
    "lag",
    "last_value",
    "lead",
    "length",
    "lower",
    "ltrim",
    "max",
    "min",
    "nth_value",
    "nullif",
    "printf",
    "quote",
    "random",
    "randomblob",
    "rank",
    "replace",
    "round",
    "row_number",
    "rtrim",
    "sign",
    "strftime",
    "substr",
    "substring",
    "sum",
    "time",
    "total",
    "trim",
    "typeof",
    "unicode",
    "unixepoch",
    "upper",
    "zeroblob",
]);

const IDENTIFIER_PATTERN =
    String.raw`(?:"[^"]+"|\[[^\]]+\]|` + "`[^`]+`" + String.raw`|[a-zA-Z_][a-zA-Z0-9_]*)`;

type DatasetShape = {
    id: string;
    tableNames: Set<string>;
    columnNames: Set<string>;
};

function normalizeIdentifier(value: string | undefined | null): string {
    return String(value ?? "")
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
    return new RegExp(`\\b${escapeRegExp(normalized)}\\s*\\(`, "i").test(sql);
}

function extractIdentifiers(sql: string): string[] {
    const cleaned = stripSqlCommentsAndStrings(sql);
    const identifiers = cleaned.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) ?? [];

    return Array.from(
        new Set(
            identifiers
                .map((identifier) => normalizeIdentifier(identifier))
                .filter(Boolean),
        ),
    );
}

function extractAliases(sql: string): Set<string> {
    const aliases = new Set<string>();
    const cleaned = stripSqlCommentsAndStrings(sql);

    for (const match of cleaned.matchAll(/\bas\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/gi)) {
        const alias = normalizeIdentifier(match[1]);
        if (alias && !SQL_KEYWORDS.has(alias)) aliases.add(alias);
    }

    const aliasPattern = new RegExp(
        String.raw`\b(?:from|join|update)\s+${IDENTIFIER_PATTERN}(?:\s+(?:as\s+)?([a-zA-Z_][a-zA-Z0-9_]*))?`,
        "gi",
    );

    for (const match of cleaned.matchAll(aliasPattern)) {
        const alias = normalizeIdentifier(match[1]);
        if (alias && !SQL_KEYWORDS.has(alias)) aliases.add(alias);
    }

    for (const match of cleaned.matchAll(/\bwith\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+as\b/gi)) {
        const alias = normalizeIdentifier(match[1]);
        if (alias) aliases.add(alias);
    }

    return aliases;
}

function extractTableReferences(sql: string): Set<string> {
    const references = new Set<string>();
    const cleaned = stripSqlCommentsAndStrings(sql);
    const patterns = [
        new RegExp(String.raw`\bfrom\s+(${IDENTIFIER_PATTERN})`, "gi"),
        new RegExp(String.raw`\bjoin\s+(${IDENTIFIER_PATTERN})`, "gi"),
        new RegExp(String.raw`\bupdate\s+(${IDENTIFIER_PATTERN})`, "gi"),
        new RegExp(String.raw`\binsert\s+into\s+(${IDENTIFIER_PATTERN})`, "gi"),
        new RegExp(String.raw`\bdelete\s+from\s+(${IDENTIFIER_PATTERN})`, "gi"),
    ];

    for (const pattern of patterns) {
        for (const match of cleaned.matchAll(pattern)) {
            const tableName = normalizeIdentifier(match[1]);
            if (tableName) references.add(tableName);
        }
    }

    return references;
}

function extractSqlCodeFences(markdown: string): string[] {
    const fences: string[] = [];
    const pattern = /(^|\n)(```|~~~)\s*sql[^\n]*\n([\s\S]*?)\n\2(?=\s|$)/gi;

    for (const match of markdown.matchAll(pattern)) {
        const sql = String(match[3] ?? "").trim();
        if (sql) fences.push(sql);
    }

    return fences;
}

function parseColumnsFromCreateTable(schemaSql: string): Map<string, Set<string>> {
    const tableColumns = new Map<string, Set<string>>();
    const cleaned = stripSqlComments(schemaSql);
    const pattern = new RegExp(
        String.raw`\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(${IDENTIFIER_PATTERN})\s*\(([\s\S]*?)\)\s*;?`,
        "gi",
    );

    for (const match of cleaned.matchAll(pattern)) {
        const tableName = normalizeIdentifier(match[1]);
        if (!tableName) continue;

        const columns = tableColumns.get(tableName) ?? new Set<string>();
        const body = String(match[2] ?? "");

        for (const rawPart of body.split(",")) {
            const part = rawPart.trim();
            if (!part) continue;

            const firstToken = normalizeIdentifier(part.split(/\s+/)[0]);
            if (
                !firstToken ||
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

        tableColumns.set(tableName, columns);
    }

    return tableColumns;
}

function parseCreatedTables(sql: string): Map<string, Set<string>> {
    return parseColumnsFromCreateTable(sql);
}

function datasetToShape(dataset: SqlDatasetArtifact): DatasetShape {
    const tableNames = new Set<string>();
    const columnNames = new Set<string>();

    for (const [tableName, columns] of parseColumnsFromCreateTable(dataset.schemaSql ?? "")) {
        tableNames.add(tableName);
        for (const column of columns) columnNames.add(column);
    }

    const rawTableSnapshots = dataset.tableSnapshots ?? {};
    const tableSnapshots = Array.isArray(rawTableSnapshots)
        ? rawTableSnapshots.map((snapshot) => [
            normalizeIdentifier((snapshot as { tableName?: string; name?: string }).tableName ?? (snapshot as { name?: string }).name),
            snapshot,
        ] as const)
        : Object.entries(rawTableSnapshots);

    for (const [snapshotKey, snapshotValue] of tableSnapshots) {
        const snapshot = snapshotValue as {
            name?: string;
            tableName?: string;
            columns?: Array<{ name?: string } | string>;
        };
        const tableName = normalizeIdentifier(
            snapshot.name ?? snapshot.tableName ?? snapshotKey,
        );

        if (tableName) tableNames.add(tableName);

        const columns = Array.isArray(snapshot.columns) ? snapshot.columns : [];
        for (const column of columns) {
            const columnName = normalizeIdentifier(
                typeof column === "string" ? column : column?.name,
            );
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
    const explicitDatasetId = args.exerciseDatasetId?.trim();
    const moduleDatasetId =
        args.seed.moduleRuntimeDefaults?.kind === "sql"
            ? args.seed.moduleRuntimeDefaults.datasetId?.trim()
            : undefined;
    const seedDataset = args.seed.moduleDataset ?? null;

    if (explicitDatasetId) {
        if (seedDataset?.id === explicitDatasetId) return seedDataset;
        return getSqlDataset(explicitDatasetId) ?? null;
    }

    if (moduleDatasetId) {
        if (seedDataset?.id === moduleDatasetId) return seedDataset;
        return getSqlDataset(moduleDatasetId) ?? seedDataset;
    }

    return seedDataset;
}

function validateCreateTableConflicts(args: {
    label: string;
    sql: string;
    datasetShape: DatasetShape;
}): string[] {
    const messages: string[] = [];

    for (const tableName of parseCreatedTables(args.sql).keys()) {
        if (!args.datasetShape.tableNames.has(tableName)) continue;
        messages.push(
            `${args.label} creates table "${tableName}" even though it already exists in effective dataset "${args.datasetShape.id}"`,
        );
    }

    return messages;
}

function mergeCreatedSchema(args: {
    datasetShape: DatasetShape;
    sql: string;
}): DatasetShape {
    const tableNames = new Set(args.datasetShape.tableNames);
    const columnNames = new Set(args.datasetShape.columnNames);

    for (const [tableName, columns] of parseCreatedTables(args.sql)) {
        tableNames.add(tableName);
        for (const column of columns) columnNames.add(column);
    }

    return {
        id: args.datasetShape.id,
        tableNames,
        columnNames,
    };
}

function shouldIgnoreIdentifier(args: {
    sql: string;
    identifier: string;
    datasetShape: DatasetShape;
    aliases: Set<string>;
    tableReferences: Set<string>;
}): boolean {
    const identifier = normalizeIdentifier(args.identifier);
    if (!identifier) return true;
    if (SQL_KEYWORDS.has(identifier)) return true;
    if (SQL_TYPE_NAMES.has(identifier)) return true;
    if (SQL_FUNCTION_NAMES.has(identifier)) return true;
    if (args.aliases.has(identifier)) return true;
    if (args.tableReferences.has(identifier)) return true;
    if (args.datasetShape.tableNames.has(identifier)) return true;
    if (isSqlFunctionReference(args.sql, identifier)) return true;
    return false;
}

function validateSqlTextAgainstDataset(args: {
    label: string;
    sql: string;
    dataset: SqlDatasetArtifact;
}): string[] {
    const messages: string[] = [];
    const baseDatasetShape = datasetToShape(args.dataset);

    messages.push(
        ...validateCreateTableConflicts({
            label: args.label,
            sql: args.sql,
            datasetShape: baseDatasetShape,
        }),
    );

    const datasetShape = mergeCreatedSchema({
        datasetShape: baseDatasetShape,
        sql: args.sql,
    });
    const sqlForReferenceScan = prepareSqlForExistingColumnReferenceScan(args.sql);
    const tableReferences = extractTableReferences(sqlForReferenceScan);

    for (const tableName of tableReferences) {
        if (datasetShape.tableNames.has(tableName)) continue;
        messages.push(
            `${args.label} references table "${tableName}" outside effective dataset "${datasetShape.id}"`,
        );
    }

    const aliases = extractAliases(sqlForReferenceScan);
    const identifiers = extractIdentifiers(sqlForReferenceScan);

    for (const identifier of identifiers) {
        if (
            shouldIgnoreIdentifier({
                sql: sqlForReferenceScan,
                identifier,
                datasetShape,
                aliases,
                tableReferences,
            })
        ) {
            continue;
        }

        if (datasetShape.columnNames.has(identifier)) continue;

        messages.push(
            `${args.label} references column "${identifier}" that does not belong to effective dataset "${datasetShape.id}"`,
        );
    }

    return messages;
}

export function validateSqlDatasetConsistency(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): string[] {
    const messages = new Set<string>();

    const sketchDataset = getEffectiveDataset({ seed: args.seed });
    for (const sketch of args.draft.sketchBlocks ?? []) {
        if (!sketchDataset) continue;

        for (const sql of extractSqlCodeFences(sketch.bodyMarkdown ?? "")) {
            for (const message of validateSqlTextAgainstDataset({
                label: `Sketch ${sketch.id}`,
                sql,
                dataset: sketchDataset,
            })) {
                messages.add(message);
            }
        }
    }

    for (const exercise of args.draft.quizDraft ?? []) {
        if (exercise.kind !== "code_input") continue;
        if ((exercise.recipeType ?? "sql_query") !== "sql_query") continue;

        const dataset = getEffectiveDataset({
            seed: args.seed,
            exerciseDatasetId: exercise.datasetId,
        });

        if (!dataset) {
            messages.add(
                `Exercise ${exercise.id} could not resolve an effective dataset`,
            );
            continue;
        }

        const sqlSnippets = collectSqlDraftSources(exercise);

        for (const sql of sqlSnippets) {
            const trimmed = typeof sql === "string" ? sql.trim() : "";
            if (!trimmed) continue;

            for (const message of validateSqlTextAgainstDataset({
                label: `Exercise ${exercise.id}`,
                sql: trimmed,
                dataset,
            })) {
                messages.add(message);
            }
        }
    }

    return Array.from(messages);
}
