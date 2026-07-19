import {
    STUDENTS_INITIAL_TABLE_SNAPSHOTS,
    STUDENTS_SQL_SCHEMA,
    STUDENTS_SQL_SEED,
} from "../data/studentsSqlFallback";
import {SqlDialect} from "@zoeskoul/practice-checks";
import {
    mergeToolPresentationPolicies,
    resolveToolPresentationForLayout,
    type ToolPresentationPolicy,
    type ToolRunnerPanePolicy,
    type ToolSurface,
} from "@zoeskoul/curriculum-contracts";
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
    /** Legacy exercise-only SQL options. Prefer toolPresentation. */
    toolSqlPaneOptions?: SqlPaneOptions | null;
    toolPresentation?: ToolPresentationPolicy | null;
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
    topicTools?: ToolPresentationPolicy | null;
    /** Legacy card-level inner SQL options. Prefer cardTools. */
    cardSqlPaneOptions?: SqlPaneOptions | null;
    cardTools?: ToolPresentationPolicy | null;
    compactLayout?: boolean;
};

export type ResolvedRightRailSqlProps = {
    toolSqlDialect: SqlDialect;
    sqlResultShape?: SqlResultShape;
    sqlDatasetId?: string;
    sqlSchemaSql?: string;
    sqlSeedSql?: string;
    sqlInitialTableSnapshots?: SqlInitialTableSnapshots;
    sqlPaneOptions?: SqlPaneOptions;
    runnerPaneOptions?: ToolRunnerPanePolicy;
    defaultSurface?: ToolSurface;
    toolPresentation?: ToolPresentationPolicy;
};

function hasOwnKeys(value: object): boolean {
    return Object.keys(value).length > 0;
}

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
    topicTools,
    cardSqlPaneOptions,
    cardTools,
    compactLayout = false,
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

    const legacyTopicTools = topicSqlFallback?.sqlPaneOptions
        ? { sqlPane: topicSqlFallback.sqlPaneOptions }
        : undefined;
    const legacyCardTools = cardSqlPaneOptions
        ? { sqlPane: cardSqlPaneOptions }
        : undefined;
    const legacyExerciseTools =
        routeCanUseBoundExercise && tool.toolSqlPaneOptions
            ? { sqlPane: tool.toolSqlPaneOptions }
            : undefined;

    const mergedToolPresentation = mergeToolPresentationPolicies(
        legacyTopicTools,
        topicTools,
        legacyCardTools,
        cardTools,
        routeCanUseBoundExercise ? legacyExerciseTools : undefined,
        routeCanUseBoundExercise ? tool.toolPresentation : undefined,
    );

    const responsivePolicy = resolveToolPresentationForLayout({
        policy: mergedToolPresentation,
        compact: compactLayout,
    });

    const authoredDefaultSurface = responsivePolicy?.defaultSurface;
    const innerTabRequestsResultsSurface = Boolean(
        responsivePolicy?.runnerPane?.defaultTab ??
        responsivePolicy?.sqlPane?.defaultTab,
    );
    const defaultSurface: ToolSurface | undefined = authoredDefaultSurface ??
        (compactLayout && isSqlTool
            ? "results"
            : innerTabRequestsResultsSurface
                ? "results"
                : undefined);

    const sqlPaneCandidate: SqlPaneOptions = {
        ...(responsivePolicy?.sqlPane ?? {}),
        ...(compactLayout && isSqlTool && !responsivePolicy?.sqlPane?.defaultTab
            ? { defaultTab: "results" as const }
            : {}),
    };
    const sqlPaneOptions: SqlPaneOptions | undefined =
        isSqlTool && hasOwnKeys(sqlPaneCandidate)
            ? sqlPaneCandidate
            : undefined;

    const toolPresentation = mergeToolPresentationPolicies(
        responsivePolicy,
        defaultSurface ? { defaultSurface } : undefined,
        sqlPaneOptions ? { sqlPane: sqlPaneOptions } : undefined,
    );

    const toolSqlDialect = firstSqlDialect(
        hasExerciseSqlDataset ? tool.toolSqlDialect : undefined,
        topicSqlFallback?.sqlDialect,
        tool.toolSqlDialect,
    );
    const sqlDatasetId = firstNonBlank(
        routeCanUseBoundExercise ? tool.toolSqlDatasetId : undefined,
        topicSqlFallback?.sqlDatasetId,
    );
    const sqlSchemaSql = firstNonBlank(
        routeCanUseBoundExercise ? tool.toolSqlSchemaSql : undefined,
        topicSqlFallback?.sqlSchemaSql,
        tool.toolLang === "sql" ? undefined : STUDENTS_SQL_SCHEMA,
    );
    const sqlSeedSql = firstNonBlank(
        routeCanUseBoundExercise ? tool.toolSqlSeedSql : undefined,
        topicSqlFallback?.sqlSeedSql,
        tool.toolLang === "sql" ? undefined : STUDENTS_SQL_SEED,
    );
    const sqlInitialTableSnapshots =
        (routeCanUseBoundExercise
            ? tool.toolSqlInitialTableSnapshots
            : undefined) ??
        topicSqlFallback?.sqlInitialTableSnapshots ??
        (tool.toolLang === "sql"
            ? undefined
            : STUDENTS_INITIAL_TABLE_SNAPSHOTS);
    const runnerPaneOptions = responsivePolicy?.runnerPane;

    return {
        toolSqlDialect,
        ...(isSqlTool ? { sqlResultShape: "table" as const } : {}),
        ...(sqlDatasetId ? { sqlDatasetId } : {}),
        ...(sqlSchemaSql ? { sqlSchemaSql } : {}),
        ...(sqlSeedSql ? { sqlSeedSql } : {}),
        ...(sqlInitialTableSnapshots ? { sqlInitialTableSnapshots } : {}),
        ...(sqlPaneOptions ? { sqlPaneOptions } : {}),
        ...(runnerPaneOptions && hasOwnKeys(runnerPaneOptions)
            ? { runnerPaneOptions }
            : {}),
        ...(defaultSurface ? { defaultSurface } : {}),
        ...(toolPresentation ? { toolPresentation } : {}),
    };
}
