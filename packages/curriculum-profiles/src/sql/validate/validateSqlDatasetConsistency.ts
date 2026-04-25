import type {
    TopicAuthoringDraft,
    TopicSeed,
    SqlDatasetArtifact,
} from "@zoeskoul/curriculum-contracts";
import { getSqlDatasetById } from "../datasets/index.js";

function extractSqlCodeBlocks(markdown: string): string[] {
    const matches = markdown.match(/```sql\s*([\s\S]*?)```/gi) ?? [];
    const tildeMatches = markdown.match(/~~~sql\s*([\s\S]*?)~~~/gi) ?? [];

    return [...matches, ...tildeMatches].map((block) =>
        block
            .replace(/^```sql\s*/i, "")
            .replace(/^~~~sql\s*/i, "")
            .replace(/```$/i, "")
            .replace(/~~~$/i, "")
            .trim(),
    );
}

const SQL_NON_COLUMN_WORDS = new Set([
    "select",
    "from",
    "where",
    "and",
    "or",
    "as",
    "count",
    "sum",
    "avg",
    "min",
    "max",
    "distinct",
    "group",
    "by",
    "order",
    "having",
    "limit",
    "asc",
    "desc",
    "upper",
    "lower",
    "length",
    "trim",
    "ltrim",
    "rtrim",
    "round",
    "abs",
    "coalesce",
    "substr",
    "substring",
    "replace",
    "cast",
    "case",
    "when",
    "then",
    "else",
    "end",
    "null",
    "is",
    "not",
    "in",
    "like",
    "between",
]);

const SQL_PLACEHOLDER_IDENTIFIERS = new Set([
    "table",
    "tables",
    "column",
    "columns",
    "column_or_expression",
    "expression",
    "expressions",
    "value",
    "values",
    "alias",
    "result",
    "results",
    "condition",
    "conditions",
    "table_name",
    "column_name",
    "blank",
    "blank1",
    "blank2",
    "placeholder",
    "____",
]);

function isPlaceholderIdentifier(value: string): boolean {
    const lower = value.toLowerCase();
    return (
        SQL_PLACEHOLDER_IDENTIFIERS.has(lower) ||
        /^_+$/.test(value) ||
        /^_{2,}[a-z0-9_]*$/i.test(value) ||
        lower.endsWith("_or_expression") ||
        lower.endsWith("_name_here") ||
        lower.endsWith("_value_here")
    );
}

function extractReferencedTables(sql: string): string[] {
    const matches = [
        ...sql.matchAll(/\bfrom\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi),
        ...sql.matchAll(/\bjoin\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi),
        ...sql.matchAll(/\bupdate\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi),
        ...sql.matchAll(/\binsert\s+into\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi),
        ...sql.matchAll(/\bdelete\s+from\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi),
    ];

    return [
        ...new Set(
            matches
                .map((m) => m[1])
                .filter((name) => name && !isPlaceholderIdentifier(name)),
        ),
    ];
}

function stripSqlComments(sql: string): string {
    return sql
        .replace(/--.*$/gm, " ")
        .replace(/\/\*[\s\S]*?\*\//g, " ");
}

function stripSqlStringLiterals(sql: string): string {
    return sql
        .replace(/'([^']|'')*'/g, " ")
        .replace(/"([^"]|"")*"/g, " ");
}

function splitTopLevelCommaSeparated(text: string): string[] {
    const parts: string[] = [];
    let current = "";
    let depth = 0;

    for (const ch of text) {
        if (ch === "(") depth += 1;
        if (ch === ")") depth = Math.max(0, depth - 1);

        if (ch === "," && depth === 0) {
            parts.push(current.trim());
            current = "";
            continue;
        }

        current += ch;
    }

    if (current.trim()) parts.push(current.trim());
    return parts;
}

function stripExplicitAlias(expression: string): string {
    return expression.replace(
        /\s+as\s+(?:"[^"]+"|'[^']+'|`[^`]+`|\[[^\]]+\]|[a-zA-Z_][a-zA-Z0-9_]*)\s*$/i,
        "",
    );
}

function stripBareTrailingAlias(expression: string): string {
    const match = expression.match(
        /^(.*?)(?:\s+)(?:"[^"]+"|'[^']+'|`[^`]+`|\[[^\]]+\]|[a-zA-Z_][a-zA-Z0-9_]*)\s*$/i,
    );

    if (!match) return expression;
    const left = match[1].trim();

    if (
        /[()+\-*/]/.test(left) ||
        /\./.test(left) ||
        /\b(?:upper|lower|length|trim|ltrim|rtrim|round|abs|coalesce|substr|substring|replace|cast|count|sum|avg|min|max)\s*\(/i.test(
            left,
        )
    ) {
        return left;
    }

    return expression;
}

function stripTableQualifiers(expression: string): string {
    return expression.replace(/\b[a-zA-Z_][a-zA-Z0-9_]*\./g, "");
}

function extractIdentifiersFromExpression(expression: string): string[] {
    let text = expression;
    text = stripExplicitAlias(text);
    text = stripBareTrailingAlias(text);
    text = stripTableQualifiers(text);

    const identifiers = new Set<string>();

    for (const match of text.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g)) {
        const value = match[1];
        if (!value) continue;

        const lower = value.toLowerCase();
        if (SQL_NON_COLUMN_WORDS.has(lower)) continue;
        if (isPlaceholderIdentifier(value)) continue;

        identifiers.add(value);
    }

    return [...identifiers];
}

function extractReferencedColumns(sql: string): string[] {
    const cleaned = stripSqlStringLiterals(stripSqlComments(sql));
    const identifiers = new Set<string>();

    const selectMatches = [
        ...cleaned.matchAll(/\bselect\s+([\s\S]*?)\bfrom\b/gi),
    ];

    for (const match of selectMatches) {
        for (const expr of splitTopLevelCommaSeparated(match[1] ?? "")) {
            for (const id of extractIdentifiersFromExpression(expr)) {
                identifiers.add(id);
            }
        }
    }

    const whereMatches = [
        ...cleaned.matchAll(
            /\bwhere\s+([\s\S]*?)(?:\bgroup\s+by\b|\border\s+by\b|\bhaving\b|\blimit\b|$)/gi,
        ),
    ];

    for (const match of whereMatches) {
        for (const id of extractIdentifiersFromExpression(match[1] ?? "")) {
            identifiers.add(id);
        }
    }

    const orderByMatches = [
        ...cleaned.matchAll(/\border\s+by\s+([\s\S]*?)(?:\blimit\b|$)/gi),
    ];

    for (const match of orderByMatches) {
        for (const expr of splitTopLevelCommaSeparated(match[1] ?? "")) {
            for (const id of extractIdentifiersFromExpression(expr)) {
                identifiers.add(id);
            }
        }
    }

    return [...identifiers];
}

function getAllowedTables(dataset: SqlDatasetArtifact) {
    return new Set(Object.keys(dataset.tableSnapshots));
}

function getAllowedColumns(dataset: SqlDatasetArtifact) {
    return new Set(
        Object.values(dataset.tableSnapshots).flatMap((table) =>
            Array.isArray(table?.columns) ? table.columns.map((c) => c.name) : [],
        ),
    );
}

function resolveDefaultDataset(args: {
    seed: TopicSeed;
}): { datasetId?: string; dataset: SqlDatasetArtifact | null } {
    const datasetId =
        args.seed.moduleRuntimeDefaults?.kind === "sql"
            ? args.seed.moduleRuntimeDefaults.datasetId
            : undefined;

    const dataset =
        args.seed.moduleDataset ??
        (datasetId ? getSqlDatasetById(datasetId) : null);

    return { datasetId, dataset };
}

function resolveExerciseDataset(args: {
    seed: TopicSeed;
    datasetId?: string;
}): { datasetId?: string; dataset: SqlDatasetArtifact | null } {
    const defaultResolved = resolveDefaultDataset({ seed: args.seed });
    const datasetId = args.datasetId ?? defaultResolved.datasetId;
    const dataset =
        datasetId && datasetId === defaultResolved.datasetId
            ? defaultResolved.dataset
            : datasetId
                ? getSqlDatasetById(datasetId)
                : defaultResolved.dataset;

    return { datasetId, dataset };
}

function validateSqlAgainstDataset(args: {
    ownerLabel: string;
    sql: string;
    datasetId?: string;
    dataset: SqlDatasetArtifact | null;
}): string[] {
    const issues: string[] = [];
    if (!args.datasetId || !args.dataset) {
        issues.push(`${args.ownerLabel} could not resolve an effective dataset`);
        return issues;
    }

    const allowedTables = getAllowedTables(args.dataset);
    const allowedColumns = getAllowedColumns(args.dataset);

    const tables = extractReferencedTables(args.sql);
    const columns = extractReferencedColumns(args.sql);

    for (const table of tables) {
        if (!allowedTables.has(table)) {
            issues.push(
                `${args.ownerLabel} references table "${table}" outside effective dataset "${args.datasetId}"`,
            );
        }
    }

    for (const column of columns) {
        if (!allowedColumns.has(column) && !allowedTables.has(column)) {
            issues.push(
                `${args.ownerLabel} references column "${column}" that does not belong to effective dataset "${args.datasetId}"`,
            );
        }
    }

    return issues;
}

export function validateSqlDatasetConsistency(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): string[] {
    const issues: string[] = [];
    const defaultResolved = resolveDefaultDataset({ seed: args.seed });

    if (!defaultResolved.datasetId || !defaultResolved.dataset) {
        return issues;
    }

    for (const block of args.draft.sketchBlocks) {
        const sqlBlocks = extractSqlCodeBlocks(block.bodyMarkdown);

        for (const sql of sqlBlocks) {
            issues.push(
                ...validateSqlAgainstDataset({
                    ownerLabel: `Sketch ${block.id}`,
                    sql,
                    datasetId: defaultResolved.datasetId,
                    dataset: defaultResolved.dataset,
                }),
            );
        }
    }

    for (const ex of args.draft.quizDraft) {
        if (ex.kind !== "code_input") continue;

        const effective = resolveExerciseDataset({
            seed: args.seed,
            datasetId: ex.datasetId,
        });

        if (!effective.datasetId || !effective.dataset) {
            issues.push(`Exercise ${ex.id} could not resolve an effective dataset`);
            continue;
        }

        const sqlTexts = [ex.starterCode, ex.solutionCode].filter(Boolean);

        for (const sql of sqlTexts) {
            issues.push(
                ...validateSqlAgainstDataset({
                    ownerLabel: `Exercise ${ex.id}`,
                    sql,
                    datasetId: effective.datasetId,
                    dataset: effective.dataset,
                }),
            );
        }
    }

    return [...new Set(issues)];
}