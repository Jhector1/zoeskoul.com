import { makeCodeInputOut } from "@/lib/practice/generator/engines/utils";
import type { RecipeHandler } from "./types";
import { makeCodeExpected } from "@/lib/practice/generator/engines/python/_shared";
import type { CodeExpectedInput } from "@/lib/practice/api/validate/schemas";

function buildSqlExpected(args: {
    datasetId: string;
    resultShape?: "table";
    ignoreRowOrder?: boolean;
    solutionCode: string;
}): CodeExpectedInput {
    const resultShape = args.resultShape ?? "table";

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
            },
        ],
        solutionCode: args.solutionCode,
    });
}

export const buildSqlQueryRecipe: RecipeHandler<any> = (def, args, resolved) => {
    const expected = buildSqlExpected({
        datasetId: def.recipe.datasetId,
        resultShape: def.recipe.resultShape,
        ignoreRowOrder: def.recipe.ignoreRowOrder,
        solutionCode: def.recipe.solutionCode,
    });

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
    });
};