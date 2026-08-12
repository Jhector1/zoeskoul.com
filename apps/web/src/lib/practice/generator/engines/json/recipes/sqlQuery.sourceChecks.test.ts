import { describe, expect, it, vi } from "vitest";

vi.mock(
  "@/lib/practice/generator/engines/sql/sqlExpected",
  () => ({
    makeSqlExpected: vi.fn(() => ({
      strategy: "sql",
      language: "sql",
      fixedSqlDialect: "sqlite",
      solutionCode:
        "SELECT category, stock, created_at FROM products;",
      tests: [],
    })),
  }),
);

vi.mock(
  "@/lib/subjects/sql/sql/runtime/resolveSqlRunnerConfig",
  () => ({
    resolveSqlRunnerConfig: vi.fn(() => ({
      isSql: true,
      sqlSchemaSql: null,
      sqlSeedSql: null,
    })),
  }),
);

import { buildSqlQueryRecipe } from "./sqlQuery";

describe("sql_query authored sourceChecks", () => {
  it("copies recipe sourceChecks into the generated expected contract", () => {
    const sourceChecks = [
      {
        type: "source_regex",
        pattern: "\\bFROM\\s+products\\b",
        message: "Use the `products` table in the FROM clause.",
      },
      {
        type: "source_regex",
        pattern:
          "\\bSELECT\\b\\s+category\\s*,\\s*stock\\s*,\\s*created_at\\b",
        message:
          "Select the required columns in the requested order: category, stock, created_at.",
      },
    ];

    const result = buildSqlQueryRecipe(
      {
        id: "try-what_select_does-sketch0",
        kind: "code_input",
        language: "sql",
        fixedSqlDialect: "sqlite",
        starterCode: "SELECT * FROM products;",
        recipe: {
          type: "sql_query",
          datasetId: "products_catalog",
          solutionCode:
            "SELECT category, stock, created_at FROM products;",
          resultShape: "table",
          ignoreRowOrder: true,
          sourceChecks,
        },
      } as any,
      {
        id: "try-what_select_does-sketch0",
        topic: "sqlv2_1.what_select_does",
        diff: "easy",
      } as any,
      {
        title: "Selecting Data with SELECT and FROM",
        prompt:
          "Return category, stock, and created_at from products, in that column order.",
        starterCode: "SELECT * FROM products;",
      } as any,
    );

    expect((result.expected as any).sourceChecks).toEqual(sourceChecks);
  });

  it("falls back to top-level sourceChecks when the recipe has none", () => {
    const sourceChecks = [
      {
        type: "source_regex",
        pattern: "\\bFROM\\s+products\\b",
        message: "Use the `products` table in the FROM clause.",
      },
    ];

    const result = buildSqlQueryRecipe(
      {
        id: "sql-top-level-source-check",
        kind: "code_input",
        language: "sql",
        fixedSqlDialect: "sqlite",
        starterCode: "SELECT * FROM products;",
        sourceChecks,
        recipe: {
          type: "sql_query",
          datasetId: "products_catalog",
          solutionCode: "SELECT id FROM products;",
          resultShape: "table",
          ignoreRowOrder: true,
        },
      } as any,
      {
        id: "sql-top-level-source-check",
        topic: "sqlv2_1.what_select_does",
        diff: "easy",
      } as any,
      {
        title: "SQL",
        prompt: "Return id from products.",
        starterCode: "SELECT * FROM products;",
      } as any,
    );

    expect((result.expected as any).sourceChecks).toEqual(sourceChecks);
  });
});
