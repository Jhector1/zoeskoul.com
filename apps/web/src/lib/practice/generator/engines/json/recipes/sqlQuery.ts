import { makeCodeInputOut } from "@/lib/practice/generator/engines/utils";
import type { RecipeHandler } from "./types";
import { resolveSqlRunnerConfig } from "@/lib/subjects/sql/runtime/resolveSqlRunnerConfig";
import { buildSqlExpectedExample } from "./expectedExample";
import { makeSqlExpected } from "@/lib/practice/generator/engines/sql/sqlExpected";

function cleanSql(value: unknown): string {
    return String(value ?? "").trim();
}

export const buildSqlQueryRecipe: RecipeHandler<any> = (def, args, resolved) => {
    const recipe = def.recipe as any;

    if (!recipe.datasetId) {
        throw new Error(`sql_query recipe "${def.id}" is missing datasetId`);
    }

    const solutionCode = cleanSql(recipe.solutionCode);

    if (!solutionCode) {
        throw new Error(`sql_query recipe "${def.id}" is missing solutionCode`);
    }

    const checkSql = cleanSql(recipe.checkSql) || undefined;

    const fixedSqlDialect = def.fixedSqlDialect ?? "sqlite";
    const resultShape = recipe.resultShape ?? "table";

    const expected = makeSqlExpected({
        recipe: {
            type: "sql_query",
            datasetId: recipe.datasetId,
            solutionCode,
            checkSql,
            resultShape,
            ignoreRowOrder: recipe.ignoreRowOrder,
        },
        fixedSqlDialect,
    });

    const resolvedSql = resolveSqlRunnerConfig({
        language: "sql",
        sqlDialect: fixedSqlDialect,
        sqlDatasetId: recipe.datasetId,
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
                solutionCode,
                checkSql,
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
        fixedSqlDialect,
        runtime: {
            kind: "sql",
            datasetId: recipe.datasetId,
            resultShape,
        },
        expected: expected as any,
        expectedExample,
        ideConfig: def.serviceOverrides ?? null,
    });
};
