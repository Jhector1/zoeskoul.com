import { buildSqlQueryExpected } from "../../base/codeInputExpected.js";
import { buildSqlExpectedExample } from "../../base/expectedExample.js";
import { getSqlDatasetById } from "../datasets/index.js";

function cleanSql(value: unknown): string {
  return String(value ?? "").trim();
}

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

  const solutionCode = cleanSql(def.recipe.solutionCode);
  const resultShape = def.recipe.resultShape ?? "table";
  const fixedSqlDialect = def.fixedSqlDialect ?? "sqlite";
  const expected = buildSqlQueryExpected({
    recipe: def.recipe,
    fixedSqlDialect,
  });
  const firstSqlTest = expected.tests[0];
  const checkSql =
      firstSqlTest && "checkSql" in firstSqlTest ? firstSqlTest.checkSql : undefined;

  const expectedExample = buildSqlExpectedExample({
    def,
    resolved,
    schemaSql: dataset.schemaSql,
    seedSql: dataset.seedSql,
    solutionCode,
    checkSql,
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
    fixedSqlDialect,
    runtime: {
      kind: "sql",
      datasetId: def.recipe.datasetId,
      resultShape,
    },
    expected,
    expectedExample,
  };
};
