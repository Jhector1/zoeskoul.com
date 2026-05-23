import {
    STUDENTS_INITIAL_TABLE_SNAPSHOTS,
    STUDENTS_SQL_SCHEMA,
    STUDENTS_SQL_SEED,
} from "../data/studentsSqlFallback";
import {SqlDialect} from "@zoeskoul/practice-checks";
import type { SqlPaneOptions } from "@/components/code/runner/components/sql/results-pane";


export type SqlInitialTableSnapshots = Record<
    string,
    {
        name: string;
        columns: { name: string; type?: string | null }[];
        rows: unknown[][];
        rowCount: number;
    }
>;

type SqlResultShape = "table";

export type RightRailSqlToolState = {
    toolLang?: string | null;
    toolSqlDialect?: SqlDialect | string | null;
    toolSqlDatasetId?: string | null;
    toolSqlSchemaSql?: string | null;
    toolSqlSeedSql?: string | null;
    toolSqlInitialTableSnapshots?: SqlInitialTableSnapshots;
    toolSqlPaneOptions?: SqlPaneOptions | null;
};

export type RightRailSqlFallback = {
    sqlDialect?: SqlDialect | string | null;
    sqlDatasetId?: string | null;
    sqlSchemaSql?: string | null;
    sqlSeedSql?: string | null;
    sqlInitialTableSnapshots?: SqlInitialTableSnapshots;
    sqlPaneOptions?: SqlPaneOptions | null;
};

export type ResolveRightRailSqlPropsArgs = {
    routeCanUseBoundExercise: boolean;
    tool: RightRailSqlToolState;
    topicSqlFallback?: RightRailSqlFallback | null;
};

export type ResolvedRightRailSqlProps = {
    toolSqlDialect: SqlDialect;
    sqlResultShape?: SqlResultShape;
    sqlDatasetId?: string;
    sqlSchemaSql?: string;
    sqlSeedSql?: string;
    sqlInitialTableSnapshots?: SqlInitialTableSnapshots;
    sqlPaneOptions?: SqlPaneOptions;
};

function firstNonBlank(...values: Array<string | null | undefined>) {
    for (const value of values) {
        if (typeof value === "string" && value.trim()) return value;
    }

    return undefined;
}

function isSqlDialect(value: unknown): value is SqlDialect {
    return (
        value === "sqlite" ||
        value === "postgres" ||
        value === "mysql" ||
        value === "mssql"
    );
}

function firstSqlDialect(...values: Array<string | null | undefined>): SqlDialect {
    for (const value of values) {
        if (isSqlDialect(value)) return value;
    }

    return "sqlite";
}

export function resolveRightRailSqlProps({
                                             routeCanUseBoundExercise,
                                             tool,
                                             topicSqlFallback,
                                         }: ResolveRightRailSqlPropsArgs): ResolvedRightRailSqlProps {
    const hasExerciseSqlDataset =
        routeCanUseBoundExercise && Boolean(firstNonBlank(tool.toolSqlDatasetId));

    const hasRuntimeSqlDataset = Boolean(
        firstNonBlank(topicSqlFallback?.sqlDatasetId),
    );

    const isSqlTool =
        tool.toolLang === "sql" ||
        hasExerciseSqlDataset ||
        hasRuntimeSqlDataset;

    return {
        toolSqlDialect: firstSqlDialect(
            hasExerciseSqlDataset ? tool.toolSqlDialect : undefined,
            topicSqlFallback?.sqlDialect,
            tool.toolSqlDialect,
        ),

        sqlResultShape: isSqlTool ? "table" : undefined,

        sqlDatasetId: firstNonBlank(
            routeCanUseBoundExercise ? tool.toolSqlDatasetId : undefined,
            topicSqlFallback?.sqlDatasetId,
        ),

        sqlSchemaSql: firstNonBlank(
            routeCanUseBoundExercise ? tool.toolSqlSchemaSql : undefined,
            topicSqlFallback?.sqlSchemaSql,
            tool.toolLang === "sql" ? undefined : STUDENTS_SQL_SCHEMA,
        ),

        sqlSeedSql: firstNonBlank(
            routeCanUseBoundExercise ? tool.toolSqlSeedSql : undefined,
            topicSqlFallback?.sqlSeedSql,
            tool.toolLang === "sql" ? undefined : STUDENTS_SQL_SEED,
        ),

        sqlInitialTableSnapshots:
            (routeCanUseBoundExercise
                ? tool.toolSqlInitialTableSnapshots
                : undefined) ??
            topicSqlFallback?.sqlInitialTableSnapshots ??
            (tool.toolLang === "sql"
                ? undefined
                : STUDENTS_INITIAL_TABLE_SNAPSHOTS),
        sqlPaneOptions:
            (routeCanUseBoundExercise
                ? tool.toolSqlPaneOptions ?? undefined
                : undefined) ??
            topicSqlFallback?.sqlPaneOptions ??
            undefined,
    };
}
