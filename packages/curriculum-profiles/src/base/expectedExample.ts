type ResolvedRecipeContext = {
  expectedExampleMeta?: string;
  maybeT?: (key: string) => string | undefined;
};

type ExpectedExample =
    | {
  kind: "terminal";
  meta?: string;
  stdin?: string;
  stdout: string;
}
    | {
  kind: "sql_result";
  meta?: string;
  columns: string[];
  rows: Array<Array<string | number | boolean | null>>;
};

type ExpectedExampleDef = {
  showExpectedExample?: boolean | { metaKey?: string };
};

type TestLike = {
  stdin?: string;
  stdout: string;
};

function shouldShowExpectedExample(def: ExpectedExampleDef): boolean {
  return def.showExpectedExample !== false;
}

function resolveMeta(
    def: ExpectedExampleDef,
    resolved: ResolvedRecipeContext,
): string | undefined {
  if (!shouldShowExpectedExample(def)) return undefined;

  if (
      typeof def.showExpectedExample === "object" &&
      def.showExpectedExample.metaKey
  ) {
    return resolved.maybeT?.(def.showExpectedExample.metaKey);
  }

  return resolved.expectedExampleMeta;
}

function normalizeCell(value: unknown): string | number | boolean | null {
  if (value == null) return null;

  if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  return String(value);
}

function stripSqlComments(sql: string): string {
  return String(sql ?? "")
      .replace(/--.*$/gm, " ")
      .replace(/\/\*[\s\S]*?\*\//g, " ");
}

function isMutationSql(sql: string): boolean {
  const cleaned = stripSqlComments(sql).trim().toLowerCase();
  return /^(insert|update|delete|replace|create|drop|alter)\b/.test(cleaned);
}

type BetterSqlite3Database = {
  exec(sql: string): void;
  prepare(sql: string): {
    reader?: boolean;
    columns(): Array<{ name: string }>;
    all(): Array<Record<string, unknown>>;
  };
  close(): void;
};

type BetterSqlite3Constructor = new (
    filename: string,
    options?: unknown,
) => BetterSqlite3Database;

type RequireLike = (moduleName: string) => unknown;

function getBetterSqlite3(): BetterSqlite3Constructor | null {
  try {
    const req = (0, eval)("require") as RequireLike;
    return req("better-sqlite3") as BetterSqlite3Constructor;
  } catch {
    return null;
  }
}

export function buildTerminalExpectedExample(args: {
  def: ExpectedExampleDef;
  resolved: ResolvedRecipeContext;
  tests: readonly TestLike[];
}): ExpectedExample | null {
  const { def, resolved, tests } = args;

  if (!shouldShowExpectedExample(def)) return null;
  if (!tests.length) return null;

  const first = tests[0];
  if (!first?.stdout) return null;

  const meta = resolveMeta(def, resolved);

  return {
    kind: "terminal",
    ...(meta ? { meta } : {}),
    ...(first.stdin ? { stdin: first.stdin } : {}),
    stdout: first.stdout,
  };
}

export function buildSqlExpectedExample(args: {
  def: ExpectedExampleDef;
  resolved: ResolvedRecipeContext;
  schemaSql: string;
  seedSql: string;
  solutionCode: string;
  checkSql?: string;
  maxRows?: number;
}): ExpectedExample | null {
  const {
    def,
    resolved,
    schemaSql,
    seedSql,
    solutionCode,
    checkSql,
    maxRows = 12,
  } = args;

  if (!shouldShowExpectedExample(def)) return null;

  const BetterSqlite3 = getBetterSqlite3();
  if (!BetterSqlite3) return null;

  const meta = resolveMeta(def, resolved);
  const db = new BetterSqlite3(":memory:");

  try {
    if (schemaSql.trim()) db.exec(schemaSql);
    if (seedSql.trim()) db.exec(seedSql);

    if (isMutationSql(solutionCode)) {
      if (!checkSql?.trim()) {
        return null;
      }

      db.exec(solutionCode);

      const checkStmt = db.prepare(checkSql);

      if (checkStmt.reader === false) {
        return null;
      }

      const columns = checkStmt.columns().map((column) => column.name);
      const rawRows = checkStmt.all();

      const rows = rawRows.slice(0, maxRows).map((rowObj) =>
          columns.map((column) => normalizeCell(rowObj[column])),
      );

      return {
        kind: "sql_result",
        ...(meta ? { meta } : {}),
        columns,
        rows,
      };
    }

    const stmt = db.prepare(solutionCode);

    if (stmt.reader === false) {
      return null;
    }

    const columns = stmt.columns().map((column) => column.name);
    const rawRows = stmt.all();

    const rows = rawRows.slice(0, maxRows).map((rowObj) =>
        columns.map((column) => normalizeCell(rowObj[column])),
    );

    return {
      kind: "sql_result",
      ...(meta ? { meta } : {}),
      columns,
      rows,
    };
  } catch {
    return null;
  } finally {
    db.close();
  }
}