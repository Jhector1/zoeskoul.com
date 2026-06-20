import type { SqlDialect } from "@/lib/practice/types";
import { DEFAULT_SQL_DIALECT } from "@/components/code/runner/constants";
import type { SqlPaneOptions } from "@/components/code/runner/components/sql/results-pane";
import { getSqlDataset } from "@/lib/subjects/sql/sql/datasets";
import { resolveEffectiveExerciseRuntime } from "@zoeskoul/curriculum-runtime/runtime";

export type SqlTableSnapshot = {
    name: string;
    columns: Array<{
        name: string;
        type?: string | null;
    }>;
    rows: unknown[][];
    rowCount: number;
};
function asSqlDialect(value: unknown): SqlDialect | null {
    const dialect = String(value ?? "").trim().toLowerCase();

    if (
        dialect === "sqlite" ||
        dialect === "postgres" ||
        dialect === "mysql" ||
        dialect === "mssql"
    ) {
        return dialect;
    }

    return null;
}
export type SqlTableSnapshots = Record<string, SqlTableSnapshot>;

export type ResolveSqlRunnerConfigArgs = {
    language?: string | null;
    sqlDialect?: string | null;
    sqlDatasetId?: string | null;
    exerciseSqlDatasetId?: string | null;
    sqlResultShape?: "table" | null;
    sqlSchemaSql?: string | null;
    sqlSeedSql?: string | null;
    sqlSetupSql?: string | null;
    sqlInitialTableSnapshots?: SqlTableSnapshots | null;
    fixedSqlDialect?: SqlDialect | null;
    defaultSqlDialect?: SqlDialect;
    runtime?: unknown;
    exerciseRuntime?: unknown;
    runtimeDefaults?: unknown;
    subjectRuntimeDefaults?: unknown;
    courseRuntimeDefaults?: unknown;
    sectionRuntimeDefaults?: unknown;
    topicRuntimeDefaults?: unknown;
    moduleRuntimeDefaults?: unknown;
    recipe?: unknown;
};

export type ResolvedSqlRunnerConfig = {
    isSql: boolean;
    sqlDialect: SqlDialect;
    sqlDatasetId?: string;
    sqlResultShape?: "table";
    sqlSchemaSql?: string;
    sqlSeedSql?: string;
    sqlSetupSql?: string;
    sqlInitialTableSnapshots?: SqlTableSnapshots;
    sqlPaneOptions?: SqlPaneOptions;
};

export function resolveSqlRunnerConfig(
    args: ResolveSqlRunnerConfigArgs,
): ResolvedSqlRunnerConfig {
    const {
        language,
        sqlDialect,
        sqlDatasetId,
        exerciseSqlDatasetId,
        sqlResultShape,
        sqlSchemaSql,
        sqlSeedSql,
        sqlSetupSql,
        sqlInitialTableSnapshots,
        fixedSqlDialect,
        defaultSqlDialect = DEFAULT_SQL_DIALECT,
    } = args;
    const effectiveRuntime = resolveEffectiveExerciseRuntime({
        language,
        exerciseRuntime: args.exerciseRuntime ?? args.runtime,
        exerciseSqlDatasetId: exerciseSqlDatasetId ?? sqlDatasetId,
        recipe: args.recipe,
        topicRuntimeDefaults: args.topicRuntimeDefaults,
        sectionRuntimeDefaults: args.sectionRuntimeDefaults,
        moduleRuntimeDefaults: args.moduleRuntimeDefaults ?? args.runtimeDefaults,
        courseRuntimeDefaults: args.courseRuntimeDefaults,
        subjectRuntimeDefaults: args.subjectRuntimeDefaults,
    });
    const isSql = effectiveRuntime.kind === "sql";
    const resolvedDatasetId = isSql
        ? (effectiveRuntime.datasetId ?? cleanString(sqlDatasetId))
        : undefined;
    const dataset = resolvedDatasetId && isSql ? getSqlDataset(resolvedDatasetId) : null;

    const resolvedDialect: SqlDialect =
        asSqlDialect(sqlDialect) ??
        asSqlDialect(fixedSqlDialect) ??
        effectiveRuntime.fixedSqlDialect ??
        asSqlDialect(dataset?.dialect) ??
        defaultSqlDialect;

    const resolvedSchemaSql =
        sqlSchemaSql ??
        sqlSetupSql ??
        dataset?.schemaSql ??
        undefined;

    const resolvedSeedSql =
        sqlSeedSql ??
        dataset?.seedSql ??
        undefined;

    const resolvedSnapshots =
        sqlInitialTableSnapshots ??
        dataset?.tableSnapshots ??
        undefined;

    const resolvedResultShape = sqlResultShape ?? effectiveRuntime.resultShape ?? "table";

    return {
        isSql,
        sqlDialect: resolvedDialect,
        sqlDatasetId: resolvedDatasetId,
        sqlResultShape: resolvedResultShape,
        sqlSchemaSql: resolvedSchemaSql,
        sqlSeedSql: resolvedSeedSql,
        sqlSetupSql: sqlSetupSql ?? undefined,
        sqlInitialTableSnapshots: resolvedSnapshots,
        sqlPaneOptions: isSql
            ? {
                showTables: effectiveRuntime.showTables,
                showErd: effectiveRuntime.showErd,
                showChen: effectiveRuntime.showChen,
                defaultTab: "tables",
            }
            : undefined,
    };

}

function cleanString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
