import "server-only";

import { getSqlDataset } from "@zoeskoul/curriculum-runtime/subjects/sql/sql/datasets";

import type {
  PublicChallengeCopyAdapterState,
  PublicChallengeCopyContextAdapter,
} from "./publicChallengeCopyContextTypes";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function firstString(
  records: Array<Record<string, unknown> | null>,
  key: string,
) {
  for (const record of records) {
    const value = text(record?.[key]);
    if (value) return value;
  }
  return "";
}

function hasWord(haystack: string, needle: string) {
  return new RegExp(
    `(^|[^a-z0-9_])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9_]|$)`,
    "i",
  ).test(haystack);
}

function sqlFacts(args: {
  prompt: string;
  checkSql: string;
  solution: string;
  tables: Array<{ name: string; columns: Array<{ name: string }> }>;
}) {
  const facts = new Set<string>();
  const privateSql = [args.prompt, args.checkSql, args.solution].join("\n");

  for (const operation of ["SELECT", "UPDATE", "INSERT", "DELETE"]) {
    if (new RegExp(`\\b${operation}\\b`, "i").test(privateSql)) {
      facts.add(operation);
    }
  }

  const referenced = args.tables.filter((table) => hasWord(privateSql, table.name));
  const requiredTables = referenced.length ? referenced : args.tables.length === 1 ? args.tables : [];

  for (const table of requiredTables) {
    facts.add(table.name);
    for (const column of table.columns) {
      if (hasWord(args.prompt, column.name) || hasWord(args.checkSql, column.name)) {
        facts.add(column.name);
      }
    }
  }

  return [...facts];
}

export const sqlPublicChallengeCopyContextAdapter: PublicChallengeCopyContextAdapter = {
  id: "runtime-sql",

  supports(state: PublicChallengeCopyAdapterState) {
    return state.context.runtimeKind === "sql" || state.context.language === "sql";
  },

  enrich(state: PublicChallengeCopyAdapterState) {
    const { exercise, recipe, runtime, runtimeDefaults } = state.records;
    const datasetId = firstString([recipe, runtime, runtimeDefaults], "datasetId");
    const dataset = datasetId ? getSqlDataset(datasetId) : null;
    const dialect =
      firstString([exercise, runtime, runtimeDefaults], "fixedSqlDialect") ||
      dataset?.dialect ||
      null;
    const checkSql = firstString([recipe, exercise], "checkSql");

    if (!dataset) {
      return { environment: { dialect, datasetId: datasetId || null } };
    }

    const tables = Object.values(dataset.tableSnapshots).map((table) => ({
      name: table.name,
      columns: table.columns.map((column) => ({ name: column.name, type: column.type })),
      rows: table.rows.slice(0, 8).map((row) => [...row]),
    }));

    const requiredFacts = sqlFacts({
      prompt: state.context.exercise.originalPrompt,
      checkSql,
      solution: state.context.privateSolutionContext ?? "",
      tables,
    });

    const referenceText = [
      state.context.exercise.originalPrompt,
      checkSql,
      state.context.privateSolutionContext ?? "",
    ].join("\n");
    const table = tables.find((item) => hasWord(referenceText, item.name)) ??
      (tables.length === 1 ? tables[0] : null);

    return {
      environment: { dialect, datasetId: dataset.id },
      resources: [{
        kind: "database_dataset",
        name: dataset.id,
        data: {
          dialect: dataset.dialect,
          schemaSql: dataset.schemaSql.slice(0, 5000),
          tables,
        },
      }],
      requiredFacts,
      technicalFallbackLead: table ? `In the ${table.name} table` : null,
    };
  },
};
