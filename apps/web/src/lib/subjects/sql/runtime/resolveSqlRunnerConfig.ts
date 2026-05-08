import type { SqlDialect } from "@/lib/practice/types";
import { DEFAULT_SQL_DIALECT } from "@/components/code/runner/constants";
import { getSqlDataset } from "@/lib/subjects/sql/datasets";

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
    sqlResultShape?: "table" | null;
    sqlSchemaSql?: string | null;
    sqlSeedSql?: string | null;
    sqlSetupSql?: string | null;
    sqlInitialTableSnapshots?: SqlTableSnapshots | null;
    fixedSqlDialect?: SqlDialect | null;
    defaultSqlDialect?: SqlDialect;
    runtime?: unknown;
    runtimeDefaults?: unknown;
    topicRuntimeDefaults?: unknown;
    moduleRuntimeDefaults?: unknown;
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
};

export function resolveSqlRunnerConfig(
    args: ResolveSqlRunnerConfigArgs,
): ResolvedSqlRunnerConfig {
    const {
        language,
        sqlDialect,
        sqlDatasetId,
        sqlResultShape,
        sqlSchemaSql,
        sqlSeedSql,
        sqlSetupSql,
        sqlInitialTableSnapshots,
        fixedSqlDialect,
        defaultSqlDialect = DEFAULT_SQL_DIALECT,
    } = args;
    const isSql = String(language ?? "").toLowerCase() === "sql";
    const dataset = sqlDatasetId && isSql ? getSqlDataset(sqlDatasetId) : null;

    const resolvedDialect: SqlDialect =
        asSqlDialect(sqlDialect) ??
        asSqlDialect(fixedSqlDialect) ??
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

    const resolvedResultShape = sqlResultShape ?? "table";

    return {
        isSql,
        sqlDialect: resolvedDialect,
        sqlDatasetId: sqlDatasetId ?? undefined,
        sqlResultShape: resolvedResultShape,
        sqlSchemaSql: resolvedSchemaSql,
        sqlSeedSql: resolvedSeedSql,
        sqlSetupSql: sqlSetupSql ?? undefined,
        sqlInitialTableSnapshots: resolvedSnapshots,
    };

}