import {
    cleanRuntimeCode,
    makeCodeInputOut
} from "@/lib/practice/generator/engines/utils";
import type { RecipeHandler } from "./types";
import { resolveSqlRunnerConfig } from "@zoeskoul/curriculum-runtime/subjects/sql/sql/runtime/resolveSqlRunnerConfig";
import { buildSqlExpectedExample } from "@zoeskoul/curriculum-runtime/expected-example";
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

    const sourceChecks = Array.isArray((def as any).sourceChecks)
        ? (def as any).sourceChecks
        : undefined;
    const expectedWithSourceChecks = {
        ...(expected as any),
        ...(sourceChecks?.length ? { sourceChecks } : {}),
    };

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
        workspace: def.workspace,
        starterFiles: def.workspace?.starterFiles,
        files: (def as any).files ?? def.workspace?.files,
        initialFiles: (def as any).initialFiles ?? def.workspace?.initialFiles,
        workspaceFiles: (def as any).workspaceFiles ?? def.workspace?.workspaceFiles,
        fixtureFiles: (def as any).fixtureFiles ?? (def.workspace as any)?.fixtureFiles,
        fixtures: (def as any).fixtures ?? (def.workspace as any)?.fixtures,
        fileFixtures: (def as any).fileFixtures ?? (def.workspace as any)?.fileFixtures,
        initialStdin: def.initialStdin,
        entryFile:
            def.entryFile ??
            def.workspace?.entryFile ??
            def.workspace?.entryFilePath ??
            def.workspace?.mainFile ??
            def.workspace?.mainFilePath,

        help: resolved.help,
        hint: resolved.hint,
        fixedSqlDialect,
        runtime: {
            kind: "sql",
            datasetId: recipe.datasetId,
            resultShape,
        },
        topicRuntimeDefaults: (def as any).topicRuntimeDefaults ?? null,
        expected: expectedWithSourceChecks as any,
        expectedExample,
        ideConfig: def.serviceOverrides ?? null,
    });
};
