import type {
    TopicAuthoringDraft,
    TopicSeed,
    SqlDatasetArtifact,
} from "@zoeskoul/curriculum-contracts";
import type { RepairReport } from "../../shared/profileServices.js";
import { makeEmptyRepairReport } from "../../shared/noopReports.js";
import { getSqlDatasetById } from "../datasets/index.js";

function extractSqlCodeBlocks(markdown: string): string[] {
    const matches = markdown.match(/```sql\s*[\s\S]*?```/gi) ?? [];
    const tildeMatches = markdown.match(/~~~sql\s*[\s\S]*?~~~/gi) ?? [];

    return [...matches, ...tildeMatches].map((block) =>
        block
            .replace(/^```sql\s*/i, "")
            .replace(/^~~~sql\s*/i, "")
            .replace(/```$/i, "")
            .replace(/~~~$/i, "")
            .trim(),
    );
}

function replaceSqlCodeBlocks(markdown: string, nextSql: string): string {
    const replacement = `\`\`\`sql\n${nextSql}\n\`\`\``;
    return markdown
        .replace(/```sql\s*[\s\S]*?```/gi, replacement)
        .replace(/~~~sql\s*[\s\S]*?~~~/gi, replacement);
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

function resolveModuleDataset(seed: TopicSeed): {
    datasetId?: string;
    dataset: SqlDatasetArtifact | null;
} {
    const datasetId =
        seed.moduleRuntimeDefaults?.kind === "sql"
            ? seed.moduleRuntimeDefaults.datasetId
            : undefined;

    const dataset =
        seed.moduleDataset ??
        (datasetId ? getSqlDatasetById(datasetId) : null);

    return { datasetId, dataset };
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

function sketchSqlNeedsRewrite(args: {
    sql: string;
    dataset: SqlDatasetArtifact;
}): boolean {
    const allowedTables = getAllowedTables(args.dataset);
    const allowedColumns = getAllowedColumns(args.dataset);

    const tables = extractReferencedTables(args.sql);
    const columns = extractReferencedColumns(args.sql);

    if (tables.some((t) => !allowedTables.has(t))) return true;
    if (columns.some((c) => !allowedColumns.has(c) && !allowedTables.has(c))) return true;

    return false;
}

function getPreferredTable(seed: TopicSeed, dataset: SqlDatasetArtifact): string {
    const preferred = seed.sqlGrounding?.preferredTeachingTable;
    if (preferred && dataset.tableSnapshots[preferred]) return preferred;
    return Object.keys(dataset.tableSnapshots)[0] ?? "table_name";
}

function getTableColumns(dataset: SqlDatasetArtifact, tableName: string): string[] {
    const table = dataset.tableSnapshots[tableName];
    return table?.columns?.map((c) => c.name) ?? [];
}

function chooseLabelColumn(args: {
    seed: TopicSeed;
    dataset: SqlDatasetArtifact;
    columns: string[];
}): string {
    const preferred = args.seed.sqlGrounding?.preferredLabelColumn;
    if (preferred && args.columns.includes(preferred)) return preferred;

    const fallbacks = ["name", "title", "customer_name", "student_name", "term"];
    return fallbacks.find((c) => args.columns.includes(c)) ?? args.columns[0] ?? "id";
}

function chooseNumericColumns(args: {
    seed: TopicSeed;
    columns: string[];
}): string[] {
    const preferred = args.seed.sqlGrounding?.preferredNumericColumns ?? [];
    const matched = preferred.filter((c) => args.columns.includes(c));
    if (matched.length > 0) return matched;

    const common = [
        "quantity",
        "unit_price",
        "price",
        "amount",
        "revenue",
        "stock_quantity",
        "grade_level",
        "id",
    ];

    return common.filter((c) => args.columns.includes(c));
}

function buildSafeModuleSketchSql(args: {
    seed: TopicSeed;
    dataset: SqlDatasetArtifact;
    originalMarkdown: string;
}): string {
    const tableName = getPreferredTable(args.seed, args.dataset);
    const columns = getTableColumns(args.dataset, tableName);
    const labelColumn = chooseLabelColumn({
        seed: args.seed,
        dataset: args.dataset,
        columns,
    });
    const numericColumns = chooseNumericColumns({
        seed: args.seed,
        columns,
    });

    const text = args.originalMarkdown.toLowerCase();

    if (/\bupper\b/.test(text)) {
        return `SELECT ${labelColumn}, UPPER(${labelColumn}) AS upper_${labelColumn}\nFROM ${tableName};`;
    }

    if (/\blower\b/.test(text)) {
        return `SELECT ${labelColumn}, LOWER(${labelColumn}) AS lower_${labelColumn}\nFROM ${tableName};`;
    }

    if (/\blength\b|\bnumber of characters\b/.test(text)) {
        return `SELECT ${labelColumn}, LENGTH(${labelColumn}) AS ${labelColumn}_length\nFROM ${tableName};`;
    }

    if (/\bcount\b|\bhow many\b|\bnumber of rows\b/.test(text)) {
        return `SELECT COUNT(*) AS row_count\nFROM ${tableName};`;
    }

    if (/\bavg\b|\baverage\b/.test(text) && numericColumns[0]) {
        return `SELECT AVG(${numericColumns[0]}) AS average_${numericColumns[0]}\nFROM ${tableName};`;
    }

    if (/\bsum\b|\btotal up\b|\badd up\b/.test(text) && numericColumns[0]) {
        return `SELECT SUM(${numericColumns[0]}) AS total_${numericColumns[0]}\nFROM ${tableName};`;
    }

    if (/\bgroup by\b/.test(text)) {
        const groupColumn = columns.find((c) => c !== labelColumn) ?? labelColumn;
        return `SELECT ${groupColumn}, COUNT(*) AS row_count\nFROM ${tableName}\nGROUP BY ${groupColumn};`;
    }

    if (numericColumns.length >= 2) {
        return `SELECT ${labelColumn}, ${numericColumns[0]}, ${numericColumns[1]}, ${numericColumns[0]} * ${numericColumns[1]} AS calculated_value\nFROM ${tableName};`;
    }

    if (numericColumns.length === 1) {
        return `SELECT ${labelColumn}, ${numericColumns[0]}, ${numericColumns[0]} * 2 AS doubled_${numericColumns[0]}\nFROM ${tableName};`;
    }

    return `SELECT ${labelColumn}\nFROM ${tableName};`;
}

export async function repairSqlDraft(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): Promise<{
    draft: TopicAuthoringDraft;
    report: RepairReport;
}> {
    const { datasetId: moduleDatasetId, dataset: moduleDataset } =
        resolveModuleDataset(args.seed);

    const report = makeEmptyRepairReport(args.seed.topicId);

    const sketchBlocks = (args.draft.sketchBlocks ?? []).map((block) => {
        if (!moduleDatasetId || !moduleDataset) return block;

        const sqlBlocks = extractSqlCodeBlocks(block.bodyMarkdown);
        if (sqlBlocks.length === 0) return block;

        const needsRewrite = sqlBlocks.some((sql) =>
            sketchSqlNeedsRewrite({
                sql,
                dataset: moduleDataset,
            }),
        );

        if (!needsRewrite) return block;

        const safeSql = buildSafeModuleSketchSql({
            seed: args.seed,
            dataset: moduleDataset,
            originalMarkdown: block.bodyMarkdown,
        });

        report.repairs.push({
            code: "SQL_REWROTE_SKETCH_TO_MODULE_DATASET",
            category: "dataset",
            severity: "medium",
            field: `sketchBlocks.${block.id}.bodyMarkdown`,
            message:
                "Rewrote sketch SQL example to use the module runtime dataset instead of off-schema or exercise-scope SQL.",
        });

        return {
            ...block,
            bodyMarkdown: replaceSqlCodeBlocks(block.bodyMarkdown, safeSql),
        };
    });

    const quizDraft = (args.draft.quizDraft ?? []).map((exercise) => {
        if (exercise.kind !== "code_input") {
            return exercise;
        }

        let next = exercise;

        if (!next.recipeType) {
            next = {
                ...next,
                recipeType: "sql_query",
            };
            report.repairs.push({
                code: "SQL_DEFAULTED_MISSING_RECIPE_TYPE",
                category: "recipe",
                severity: "low",
                field: `${exercise.id}.recipeType`,
                message: `Defaulted missing recipeType to "sql_query" for SQL profile.`,
            });
        }

        if (!next.datasetId && moduleDatasetId) {
            next = {
                ...next,
                datasetId: moduleDatasetId,
            };
            report.repairs.push({
                code: "SQL_DEFAULTED_MISSING_DATASET",
                category: "dataset",
                severity: "low",
                field: `${exercise.id}.datasetId`,
                message: "Defaulted missing datasetId from module runtime defaults.",
            });
        }

        return next;
    });

    return {
        draft: {
            ...args.draft,
            sketchBlocks,
            quizDraft,
        },
        report,
    };
}