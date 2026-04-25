import { makeCodeInputOut } from "@/lib/practice/generator/engines/utils";
import type { RecipeHandler } from "./types";
import { makeCodeExpected } from "@/lib/practice/generator/engines/python/_shared";
import type { CodeExpectedInput } from "@/lib/practice/api/validate/schemas";
import { resolveSqlRunnerConfig } from "@/lib/subjects/sql/runtime/resolveSqlRunnerConfig";
import { buildSqlExpectedExample } from "./expectedExample";

function stripSqlComments(sql: string): string {
    return String(sql ?? "")
        .replace(/--.*$/gm, " ")
        .replace(/\/\*[\s\S]*?\*\//g, " ");
}

function normalizeIdentifier(identifier: string): string {
    return identifier.trim().replace(/^["'`\[]+/, "").replace(/["'`\]]+$/, "");
}

function quoteSqliteIdentifier(identifier: string): string {
    const clean = normalizeIdentifier(identifier);

    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(clean)) {
        throw new Error(`Unsafe SQL identifier for generated checkSql: ${identifier}`);
    }

    return `"${clean.replace(/"/g, '""')}"`;
}

function extractMutationTableName(sql: string): string | null {
    const cleaned = stripSqlComments(sql).trim();

    const insertMatch = cleaned.match(
        /^\s*insert\s+(?:or\s+\w+\s+)?into\s+["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/i,
    );
    if (insertMatch?.[1]) return normalizeIdentifier(insertMatch[1]);

    const updateMatch = cleaned.match(
        /^\s*update\s+["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/i,
    );
    if (updateMatch?.[1]) return normalizeIdentifier(updateMatch[1]);

    const deleteMatch = cleaned.match(
        /^\s*delete\s+from\s+["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/i,
    );
    if (deleteMatch?.[1]) return normalizeIdentifier(deleteMatch[1]);

    const replaceMatch = cleaned.match(
        /^\s*replace\s+(?:or\s+\w+\s+)?into\s+["'`[]?([a-zA-Z_][a-zA-Z0-9_]*)["'`\]]?/i,
    );
    if (replaceMatch?.[1]) return normalizeIdentifier(replaceMatch[1]);

    return null;
}

function inferMutationCheckSql(solutionCode: string): string | undefined {
    const tableName = extractMutationTableName(solutionCode);
    if (!tableName) return undefined;

    const quoted = quoteSqliteIdentifier(tableName);

    return `SELECT * FROM ${quoted} ORDER BY 1;`;
}

function buildSqlExpected(args: {
    datasetId: string;
    resultShape?: "table";
    ignoreRowOrder?: boolean;
    solutionCode: string;
    checkSql?: string;
}): CodeExpectedInput {
    const resultShape = args.resultShape ?? "table";
    const checkSql = args.checkSql?.trim() || inferMutationCheckSql(args.solutionCode);

    return makeCodeExpected({
        kind: "code_input",
        language: "sql",
        fixedSqlDialect: "sqlite",
        runtime: {
            kind: "sql",
            datasetId: args.datasetId,
            resultShape,
        },
        tests: [
            {
                kind: "sql",
                sqlDialect: "sqlite",
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
        solutionCode: args.solutionCode,
    });
}

export const buildSqlQueryRecipe: RecipeHandler<any> = (def, args, resolved) => {
    if (!def.recipe.datasetId) {
        throw new Error(`sql_query recipe "${def.id}" is missing datasetId`);
    }

    const expected = buildSqlExpected({
        datasetId: def.recipe.datasetId,
        resultShape: def.recipe.resultShape,
        ignoreRowOrder: def.recipe.ignoreRowOrder,
        solutionCode: def.recipe.solutionCode,
        checkSql: def.recipe.checkSql,
    });

    const resolvedSql = resolveSqlRunnerConfig({
        language: "sql",
        sqlDialect: def.fixedSqlDialect ?? "sqlite",
        sqlDatasetId: def.recipe.datasetId,
    });

    const expectedExample =
        resolvedSql.isSql &&
        resolvedSql.sqlSchemaSql &&
        resolvedSql.sqlSeedSql
            ? buildSqlExpectedExample({
                def,
                resolved,
                schemaSql: resolvedSql.sqlSchemaSql,
                seedSql: resolvedSql.sqlSeedSql,
                solutionCode: def.recipe.solutionCode,
            })
            : null;

    return makeCodeInputOut({
        archetype: def.id,
        id: args.id,
        topic: args.topic,
        diff: args.diff,
        title: resolved.title,
        prompt: resolved.prompt,
        language: def.language ?? "sql",
        starterCode: resolved.starterCode,
        help: resolved.help,
        hint: resolved.hint,
        fixedSqlDialect: def.fixedSqlDialect ?? "sqlite",
        runtime: {
            kind: "sql",
            datasetId: def.recipe.datasetId,
            resultShape: def.recipe.resultShape ?? "table",
        },
        expected,
        expectedExample,
    });
};