import { buildSqlExpectedExample } from "../../base/expectedExample.js";

export const buildSqlQueryRecipe = (def: any, args: any, resolved: any) => {
  if (!def.recipe.datasetId) {
    throw new Error(`sql_query recipe "${def.id}" is missing datasetId`);
  }

  const expectedExample = buildSqlExpectedExample({
    def,
    resolved,
    schemaSql: "-- TODO: wire real schema SQL",
    seedSql: "-- TODO: wire real seed SQL",
    solutionCode: def.recipe.solutionCode
  });

  return {
    archetype: def.id,
    id: args.id,
    topic: args.topic,
    diff: args.diff,
    kind: "code_input",
    title: resolved.title,
    prompt: resolved.prompt,
    language: "sql",
    starterCode: resolved.starterCode,
    help: resolved.help,
    hint: resolved.hint,
    fixedSqlDialect: def.fixedSqlDialect ?? "sqlite",
    runtime: {
      kind: "sql",
      datasetId: def.recipe.datasetId,
      resultShape: def.recipe.resultShape ?? "table"
    },
    expected: {
      kind: "code_input",
      language: "sql",
      fixedSqlDialect: "sqlite",
      runtime: {
        kind: "sql",
        datasetId: def.recipe.datasetId,
        resultShape: def.recipe.resultShape ?? "table"
      },
      tests: [
        {
          kind: "sql",
          sqlDialect: "sqlite",
          runtime: {
            kind: "sql",
            datasetId: def.recipe.datasetId,
            resultShape: def.recipe.resultShape ?? "table"
          },
          compareTo: "solution",
          match: "table_exact",
          ignoreRowOrder: def.recipe.ignoreRowOrder ?? false
        }
      ],
      solutionCode: def.recipe.solutionCode
    },
    expectedExample
  };
};
