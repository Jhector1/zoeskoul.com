export type CodeExpectedExample =
  | { kind: "terminal"; meta?: string; stdin?: string; stdout: string }
  | { kind: "sql_result"; meta?: string; columns: string[]; rows: Array<Array<string | number | null>> };

type ResolvedRecipeContext = {
  expectedExampleMeta?: string;
  maybeT?: (key: string) => string | undefined;
};

type TestLike = { stdin?: string; stdout: string };

function shouldShowExpectedExample(def: any): boolean {
  return def.showExpectedExample !== false;
}

function resolveMeta(def: any, resolved: ResolvedRecipeContext): string | undefined {
  if (!shouldShowExpectedExample(def)) return undefined;
  if (typeof def.showExpectedExample === "object" && def.showExpectedExample.metaKey) {
    return resolved.maybeT?.(def.showExpectedExample.metaKey);
  }
  return resolved.expectedExampleMeta;
}

export function buildTerminalExpectedExample(args: {
  def: any;
  resolved: ResolvedRecipeContext;
  tests: readonly TestLike[];
}): CodeExpectedExample | null {
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
    stdout: first.stdout
  };
}

export function buildSqlExpectedExample(_args: {
  def: any;
  resolved: ResolvedRecipeContext;
  schemaSql: string;
  seedSql: string;
  solutionCode: string;
  maxRows?: number;
}): CodeExpectedExample | null {
  return null;
}
