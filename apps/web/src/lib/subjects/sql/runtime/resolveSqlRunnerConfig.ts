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


    const isSql = String(language ?? "").toLowerCase() === "sql";
    const dataset =
        sqlDatasetId && isSql ? getSqlDataset(sqlDatasetId) : null;

    const resolvedDialect =
        isSql
            ? sqlDialect ?? dataset?.dialect ?? defaultSqlDialect
            : defaultSqlDialect;

    const resolvedSchemaSql =
        isSql
            ? sqlSchemaSql ?? sqlSetupSql ?? dataset?.schemaSql ?? undefined
            : undefined;

    const resolvedSeedSql =
        isSql
            ? sqlSeedSql ?? dataset?.seedSql ?? undefined
            : undefined;

    const resolvedSnapshots =
        isSql
            ? sqlInitialTableSnapshots ?? dataset?.tableSnapshots ?? undefined
            : undefined;

    return {
        isSql,
        sqlDialect: resolvedDialect,
        sqlDatasetId: isSql ? sqlDatasetId ?? undefined : undefined,
        sqlSchemaSql: resolvedSchemaSql,
        sqlSeedSql: resolvedSeedSql,
        sqlSetupSql: isSql ? sqlSetupSql ?? undefined : undefined,
        sqlInitialTableSnapshots: resolvedSnapshots,
    };
}