import { buildSqlExpectedExample } from "../../base/expectedExample.js";

function buildSqlExpected(args: {
    datasetId: string;
    resultShape?: "table";
    ignoreRowOrder?: boolean;
    solutionCode: string;
}) {
    const resultShape = args.resultShape ?? "table";

    return {
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
            },
        ],
        solutionCode: args.solutionCode,
    };
}

function resolveSqlRunnerConfig(args: {
    sqlDialect: string;
    sqlDatasetId: string;
}) {
    return {
        isSql: true,
        sqlSchemaSql: process.env[`SQL_SCHEMA_${args.sqlDatasetId}`] ?? "",
        sqlSeedSql: process.env[`SQL_SEED_${args.sqlDatasetId}`] ?? "",
    };
}

export const buildSqlQueryRecipe = (def: any, args: any, resolved: any) => {
    if (!def.recipe.datasetId) {
        throw new Error(`sql_query recipe "${def.id}" is missing datasetId`);
    }

    const expected = buildSqlExpected({
        datasetId: def.recipe.datasetId,
        resultShape: def.recipe.resultShape,
        ignoreRowOrder: def.recipe.ignoreRowOrder,
        solutionCode: def.recipe.solutionCode,
    });

    const resolvedSql = resolveSqlRunnerConfig({
        sqlDialect: def.fixedSqlDialect ?? "sqlite",
        sqlDatasetId: def.recipe.datasetId,
    });

    const expectedExample =
        resolvedSql.isSql && resolvedSql.sqlSchemaSql && resolvedSql.sqlSeedSql
            ? buildSqlExpectedExample({
                def,
                resolved,
                schemaSql: resolvedSql.sqlSchemaSql,
                seedSql: resolvedSql.sqlSeedSql,
                solutionCode: def.recipe.solutionCode,
            })
            : null;

    return {
        archetype: def.id,
        id: args.id,
        topic: args.topic,
        diff: args.diff,
        kind: "code_input",
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
    };
};