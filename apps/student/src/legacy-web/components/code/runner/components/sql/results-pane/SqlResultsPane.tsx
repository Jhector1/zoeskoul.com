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
import type { SchemaModel, SqlPaneOptions, SqlTableSnapshots } from "./SqlResultsPane.types";
import {cn} from "@/components/ide/utils";

function buildSchemaFromSnapshots(snapshots?: SqlTableSnapshots | null): SchemaModel {
    const tables = Object.values(snapshots ?? {})
        .filter((snapshot) => snapshot && typeof snapshot.name === "string")
        .map((snapshot) => ({
            id: snapshot.name,
            name: snapshot.name,
            columns: (snapshot.columns ?? []).map((column) => ({
                name: column.name,
                type: column.type ?? "",
                nullable: true,
                isPk: false,
                isFk: false,
                isUnique: false,
            })),
        }));

    return { tables, relations: [] };
}

export default function SqlResultsPane(props: {
    result: SqlRunResult | null;
    busy: boolean;
    className?: string;
    schemaSql?: string;
    initialTableSnapshots?: SqlTableSnapshots;
    viewKey?: string;
    paneOptions?: SqlPaneOptions;
}) {
    const {
        result,
        busy,
        className,
        schemaSql = "",
        initialTableSnapshots,
        viewKey = "",
        paneOptions,
    } = props;

    const schema = React.useMemo(() => {
        const parsed = parseSchemaSql(schemaSql);
        if (parsed.tables.length > 0) return parsed;
        return buildSchemaFromSnapshots(initialTableSnapshots);
    }, [schemaSql, initialTableSnapshots]);

    const {
        tab,
        setTab,
        positions,
        tableSnapshots,
        displayResult,
        handleMove,
        availableTabs,
    } = useSqlResultsPaneState({
        result,
        busy,
        schema,
        schemaSql,
        initialTableSnapshots,
        viewKey,
        paneOptions,
    });

    const renderTab = (fallback: React.ReactNode = null) => {
        if (tab === "results") {
            if (!displayResult) return fallback;
            return displayResult.ok ? (
                <ResultsTab result={displayResult} />
            ) : (
                <SqlErrorState result={displayResult} />
            );
        }

        if (tab === "tables") {
            return (
                <TablesTab
                    schema={schema}
                    positions={positions}
                    onMove={handleMove}
                    tableSnapshots={tableSnapshots}
                />
            );
        }

        if (tab === "erd" && availableTabs.includes("erd")) {
            return (
                <ErdTab
                    schema={schema}
                    positions={positions}
                    onMove={handleMove}
                />
            );
        }

        if (tab === "chen" && availableTabs.includes("chen")) {
            return (
                <ChenTab
                    schema={schema}
                    positions={positions}
                    onMove={handleMove}
                />
            );
        }

        return fallback;
    };

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
                <TabsRow tab={tab} setTab={setTab} availableTabs={availableTabs} />
                <div className="min-h-0 flex-1">
                    {renderTab(
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
                <TabsRow tab={tab} setTab={setTab} availableTabs={availableTabs} />
                <div className="min-h-0 flex-1">
                    {renderTab()}
                </div>
            </div>
        );
    }

    return (
        <div className={cn("flex h-full min-h-0 flex-col gap-3", className)}>
            <TabsRow tab={tab} setTab={setTab} availableTabs={availableTabs} />
            <div className="min-h-0 flex-1">
                {renderTab()}
            </div>
        </div>
    );
}
