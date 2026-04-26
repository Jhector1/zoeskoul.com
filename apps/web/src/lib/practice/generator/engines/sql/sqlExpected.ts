import type { CodeExpectedInput } from "@/lib/practice/api/validate/schemas";
import type { SqlDialect } from "@/lib/practice/types";

function stripSqlComments(sql: string): string {
    return String(sql ?? "")
        .replace(/--.*$/gm, " ")
        .replace(/\/\*[\s\S]*?\*\//g, " ");
}

function normalizeSql(value: unknown): string {
    return String(value ?? "").trim();
}

function normalizeIdentifier(identifier: string): string {
    return identifier
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

export function isMutationSql(sql: string): boolean {
    const cleaned = stripSqlComments(sql).trim().toLowerCase();
    return /^(insert|update|delete|replace|create|drop|alter)\b/.test(cleaned);
}

function extractMutationTableName(sql: string): string | null {
    const cleaned = stripSqlComments(sql).trim();

    const insertMatch = cleaned.match(
        /^\s*insert\s+(?:or\s+\w+\s+)?into\s+["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/i,
    );
    if (insertMatch?.[1]) return normalizeIdentifier(insertMatch[1]);

    const replaceMatch = cleaned.match(
        /^\s*replace\s+(?:or\s+\w+\s+)?into\s+["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/i,
    );
    if (replaceMatch?.[1]) return normalizeIdentifier(replaceMatch[1]);

    const updateMatch = cleaned.match(
        /^\s*update\s+["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/i,
    );
    if (updateMatch?.[1]) return normalizeIdentifier(updateMatch[1]);

    const deleteMatch = cleaned.match(
        /^\s*delete\s+from\s+["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/i,
    );
    if (deleteMatch?.[1]) return normalizeIdentifier(deleteMatch[1]);

    return null;
}

export function inferMutationCheckSql(solutionCode: string): string | undefined {
    if (!isMutationSql(solutionCode)) return undefined;

    const tableName = extractMutationTableName(solutionCode);
    if (!tableName) return undefined;

    return `SELECT * FROM ${quoteSqliteIdentifier(tableName)} ORDER BY 1;`;
}

export function makeSqlExpected(args: {
    datasetId: string;
    solutionCode: string;
    fixedSqlDialect?: SqlDialect;
    resultShape?: "table";
    ignoreRowOrder?: boolean;
    checkSql?: string;
}): CodeExpectedInput {
    const fixedSqlDialect = args.fixedSqlDialect ?? "sqlite";
    const resultShape = args.resultShape ?? "table";
    const solutionCode = normalizeSql(args.solutionCode);

    if (!solutionCode) {
        throw new Error("SQL code_input expected payload requires solutionCode.");
    }

    const checkSql =
        normalizeSql(args.checkSql) || inferMutationCheckSql(solutionCode);

    if (isMutationSql(solutionCode) && !checkSql) {
        throw new Error(
            "Mutation SQL exercises require checkSql so the grader can verify final database state.",
        );
    }

    return {
        kind: "code_input",
        language: "sql",
        fixedSqlDialect,
        runtime: {
            kind: "sql",
            datasetId: args.datasetId,
            resultShape,
        },
        tests: [
            {
                kind: "sql",
                sqlDialect: fixedSqlDialect,
                runtime: {
                    kind: "sql",
                    datasetId: args.datasetId,
                    resultShape,
                },
                compareTo: "solution",
                match: "table_exact",
                ignoreRowOrder: args.ignoreRowOrder ?? false,
                ...(checkSql ? { checkSql } : {}),
            },
        ],
        solutionCode,
    };
}