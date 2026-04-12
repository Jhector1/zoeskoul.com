"use client";

import React from "react";
import type { SqlRunResult } from "@/lib/code/types";
import { EmptySchemaState } from "./components/EmptySchemaState";
import { SqlErrorState } from "./components/SqlErrorState";
import { TabsRow } from "./components/TabsRow";
import { ChenTab } from "./components/tabs/ChenTab";
import { ErdTab } from "./components/tabs/ErdTab";
import { ResultsTab } from "./components/tabs/ResultsTab";
import { TablesTab } from "./components/tabs/TablesTab";
import { useSqlResultsPaneState } from "./hooks/useSqlResultsPaneState";
import { parseSchemaSql } from "./lib/schema";
import { SURFACE } from "./SqlResultsPane.constants";
import type { SqlTableSnapshots } from "./SqlResultsPane.types";
import {cn} from "@/components/ide/utils";

export default function SqlResultsPane(props: {
    result: SqlRunResult | null;
    busy: boolean;
    className?: string;
    schemaSql?: string;
    initialTableSnapshots?: SqlTableSnapshots;
    viewKey?: string;
}) {
    const {
        result,
        busy,
        className,
        schemaSql = "",
        initialTableSnapshots,
        viewKey = "",
    } = props;

    const schema = React.useMemo(() => parseSchemaSql(schemaSql), [schemaSql]);

    const {
        tab,
        setTab,
        positions,
        tableSnapshots,
        displayResult,
        handleMove,
    } = useSqlResultsPaneState({
        result,
        busy,
        schema,
        schemaSql,
        initialTableSnapshots,
        viewKey,
    });

    if (busy) {
        return (
            <div
                className={cn(
                    "flex h-full min-h-0 items-center justify-center p-6",
                    SURFACE,
                    className,
                )}
            >
                <div className="text-center">
                    <div className="text-sm font-medium text-neutral-900 dark:text-white/90">
                        Running query…
                    </div>
                    <div className="mt-1 text-[11px] font-medium text-neutral-500 dark:text-white/50">
                        Executing SQL and preparing rows
                    </div>
                </div>
            </div>
        );
    }

    if (!displayResult) {
        return (
            <div className={cn("flex h-full min-h-0 flex-col gap-3", className)}>
                <TabsRow tab={tab} setTab={setTab} />
                <div className="min-h-0 flex-1">
                    {tab === "tables" ? (
                        <TablesTab
                            schema={schema}
                            positions={positions}
                            onMove={handleMove}
                            tableSnapshots={tableSnapshots}
                        />
                    ) : tab === "erd" ? (
                        <ErdTab
                            schema={schema}
                            positions={positions}
                            onMove={handleMove}
                        />
                    ) : tab === "chen" ? (
                        <ChenTab
                            schema={schema}
                            positions={positions}
                            onMove={handleMove}
                        />
                    ) : (
                        <EmptySchemaState
                            title="No SQL result yet"
                            subtitle="Run the query to view rows, columns, notices, and execution details."
                        />
                    )}
                </div>
            </div>
        );
    }

    if (!displayResult.ok) {
        return (
            <div className={cn("flex h-full min-h-0 flex-col gap-3", className)}>
                <TabsRow tab={tab} setTab={setTab} />
                <div className="min-h-0 flex-1">
                    {tab === "results" ? (
                        <SqlErrorState result={displayResult} />
                    ) : tab === "tables" ? (
                        <TablesTab
                            schema={schema}
                            positions={positions}
                            onMove={handleMove}
                            tableSnapshots={tableSnapshots}
                        />
                    ) : tab === "erd" ? (
                        <ErdTab
                            schema={schema}
                            positions={positions}
                            onMove={handleMove}
                        />
                    ) : (
                        <ChenTab
                            schema={schema}
                            positions={positions}
                            onMove={handleMove}
                        />
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className={cn("flex h-full min-h-0 flex-col gap-3", className)}>
            <TabsRow tab={tab} setTab={setTab} />
            <div className="min-h-0 flex-1">
                {tab === "results" ? (
                    <ResultsTab result={displayResult} />
                ) : tab === "tables" ? (
                    <TablesTab
                        schema={schema}
                        positions={positions}
                        onMove={handleMove}
                        tableSnapshots={tableSnapshots}
                    />
                ) : tab === "erd" ? (
                    <ErdTab
                        schema={schema}
                        positions={positions}
                        onMove={handleMove}
                    />
                ) : (
                    <ChenTab
                        schema={schema}
                        positions={positions}
                        onMove={handleMove}
                    />
                )}
            </div>
        </div>
    );
}
