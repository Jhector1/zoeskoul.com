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
    sqlResultShape?: "table" | null;

    sqlSchemaSql?: string | null;
    sqlSeedSql?: string | null;
    sqlSetupSql?: string | null;

    sqlInitialTableSnapshots?: SqlTableSnapshots | null;

    defaultSqlDialect?: SqlDialect;
};

function firstNonBlank(...values: Array<string | null | undefined>) {
    for (const value of values) {
        if (typeof value === "string" && value.trim()) return value;
    }
    return undefined;
}

function cleanOptionalNonBlank(value: string | null | undefined) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

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
        defaultSqlDialect = DEFAULT_SQL_DIALECT,
    } = args;


    const isSql = String(language ?? "").toLowerCase() === "sql";
    const normalizedDatasetId = cleanOptionalNonBlank(sqlDatasetId);
    const normalizedSetupSql = cleanOptionalNonBlank(sqlSetupSql);
    const dataset =
        normalizedDatasetId && isSql ? getSqlDataset(normalizedDatasetId) : null;

    const resolvedDialect =
        isSql
            ? sqlDialect ?? dataset?.dialect ?? defaultSqlDialect
            : defaultSqlDialect;

    const resolvedSchemaSql =
        isSql
            ? firstNonBlank(sqlSchemaSql, normalizedSetupSql, dataset?.schemaSql)
            : undefined;

    const resolvedSeedSql =
        isSql
            ? firstNonBlank(sqlSeedSql, dataset?.seedSql)
            : undefined;

    const resolvedSnapshots =
        isSql
            ? sqlInitialTableSnapshots ?? dataset?.tableSnapshots ?? undefined
            : undefined;

    return {
        isSql,
        sqlDialect: resolvedDialect,
        sqlDatasetId: isSql ? normalizedDatasetId : undefined,
        sqlResultShape: isSql ? (sqlResultShape ?? "table") : undefined,
        sqlSchemaSql: resolvedSchemaSql,
        sqlSeedSql: resolvedSeedSql,
        sqlSetupSql: isSql ? normalizedSetupSql : undefined,
        sqlInitialTableSnapshots: resolvedSnapshots,
    };
}
