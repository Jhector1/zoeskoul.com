"use client";

import React from "react";
import { isSqlRunResult } from "@/lib/code/types";
import type { CodeRunnerController } from "@/components/code/runner/runtime";
import SqlResultsPane from "@/components/code/runner/components/sql/results-pane";

function SqlErrorPane(props: { message: string }) {
    return (
        <div className="ui-surface-danger p-4">
            <div className="text-sm font-medium text-rose-800 dark:text-rose-200">
                SQL run error
            </div>

            <pre className="mt-2 whitespace-pre-wrap break-words text-[12px] font-medium text-rose-800 dark:text-rose-200">
                {props.message}
            </pre>
        </div>
    );
}

export default function SqlOutputSurface(props: {
    controller: CodeRunnerController;
    sqlSchemaSql?: string;
    sqlInitialTableSnapshots?: Record<
        string,
        {
            name: string;
            columns: Array<{ name: string; type?: string | null }>;
            rows: unknown[][];
            rowCount: number;
        }
    >;
    sqlViewKey?: string;
}) {
    const {
        controller,
        sqlSchemaSql = "",
        sqlInitialTableSnapshots,
        sqlViewKey,
    } = props;

    const sqlResult =
        controller.lastRunLanguage === "sql" && isSqlRunResult(controller.lastResult)
            ? controller.lastResult
            : null;

    const genericSqlError =
        controller.lastRunLanguage === "sql" &&
        controller.lastResult &&
        !isSqlRunResult(controller.lastResult)
            ? controller.lastResult
            : null;

    if (genericSqlError) {
        return (
            <SqlErrorPane
                message={genericSqlError.error ?? genericSqlError.status ?? "SQL run failed."}
            />
        );
    }

    return (
        <SqlResultsPane
            key={`${sqlViewKey ?? ""}::${sqlSchemaSql}`}
            result={sqlResult}
            busy={controller.busy}
            schemaSql={sqlSchemaSql}
            initialTableSnapshots={sqlInitialTableSnapshots}
            viewKey={sqlViewKey}
        />
    );
}