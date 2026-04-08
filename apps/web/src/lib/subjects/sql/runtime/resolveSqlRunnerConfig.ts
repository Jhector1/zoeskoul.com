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

export type SqlTableSnapshots = Record<string, SqlTableSnapshot>;

export type ResolveSqlRunnerConfigArgs = {
    language?: string | null;

    sqlDialect?: SqlDialect | null;
    sqlDatasetId?: string | null;

    sqlSchemaSql?: string | null;
    sqlSeedSql?: string | null;
    sqlSetupSql?: string | null;

    sqlInitialTableSnapshots?: SqlTableSnapshots | null;

    defaultSqlDialect?: SqlDialect;
};

export type ResolvedSqlRunnerConfig = {
    isSql: boolean;
    sqlDialect: SqlDialect;
    sqlDatasetId?: string;
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
        sqlSchemaSql,
        sqlSeedSql,
        sqlSetupSql,
        sqlInitialTableSnapshots,
        defaultSqlDialect = DEFAULT_SQL_DIALECT,
    } = args;
    console.log(7777777777,sqlDatasetId)

    const isSql = String(language ?? "").toLowerCase() === "sql";
    const dataset =
        sqlDatasetId && isSql ? getSqlDataset(sqlDatasetId) : null;

    const resolvedDialect =
        sqlDialect ??
        dataset?.dialect ??
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

    return {
        isSql,
        sqlDialect: resolvedDialect,
        sqlDatasetId: sqlDatasetId ?? undefined,
        sqlSchemaSql: resolvedSchemaSql,
        sqlSeedSql: resolvedSeedSql,
        sqlSetupSql: sqlSetupSql ?? undefined,
        sqlInitialTableSnapshots: resolvedSnapshots,
    };
}