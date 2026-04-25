import { buildSqlExpectedExample } from "../../base/expectedExample.js";
import { getSqlDatasetById } from "../datasets/index.js";

export const buildSqlQueryRecipe = (def: any, args: any, resolved: any) => {
  if (!def.recipe.datasetId) {
    throw new Error(`sql_query recipe "${def.id}" is missing datasetId`);
  }

  const dataset = getSqlDatasetById(def.recipe.datasetId);
  if (!dataset) {
    throw new Error(
        `sql_query recipe "${def.id}" references unknown dataset "${def.recipe.datasetId}"`,
    );
  }

  const expectedExample = buildSqlExpectedExample({
    def,
    resolved,
    schemaSql: dataset.schemaSql,
    seedSql: dataset.seedSql,
    solutionCode: def.recipe.solutionCode,
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
      resultShape: def.recipe.resultShape ?? "table",
    },
    expected: {
      kind: "code_input",
      language: "sql",
      fixedSqlDialect: "sqlite",
      runtime: {
        kind: "sql",
        datasetId: def.recipe.datasetId,
        resultShape: def.recipe.resultShape ?? "table",
      },
      tests: [
        {
          kind: "sql",
          sqlDialect: "sqlite",
          runtime: {
            kind: "sql",
            datasetId: def.recipe.datasetId,
            resultShape: def.recipe.resultShape ?? "table",
          },
          compareTo: "solution",
          match: "table_exact",
          ignoreRowOrder: def.recipe.ignoreRowOrder ?? false,
        },
      ],
      solutionCode: def.recipe.solutionCode,
    },
    expectedExample,
  };
};