"use client";

import React from "react";
import type { SqlRunResult } from "@/lib/code/types";
import {
    buildChenLayout,
    buildTableLayout,
    buildTablesCanvasLayout,
    diagramPosKey,
    syncTabDefaults,
} from "../lib/diagram-layout";
import {
    buildDefaultTableSnapshots,
    buildTablePreviewMetrics,
} from "../lib/snapshots";
import type {
    DiagramPositions,
    DiagramTabKey,
    SchemaModel,
    SqlTableSnapshots,
    TabKey,
} from "../SqlResultsPane.types";
import { getTableSnapshots } from "../lib/snapshots";

export function useSqlResultsPaneState(args: {
    result: SqlRunResult | null;
    busy: boolean;
    schema: SchemaModel;
    schemaSql: string;
    initialTableSnapshots?: SqlTableSnapshots;
    viewKey?: string;
}) {
    const {
        result,
        busy,
        schema,
        schemaSql,
        initialTableSnapshots,
        viewKey = "",
    } = args;

    const [tab, setTab] = React.useState<TabKey>("tables");
    const [positions, setPositions] = React.useState<DiagramPositions>({});

    const sourceKey = React.useMemo(() => {
        const snapshotKey = Object.entries(initialTableSnapshots ?? {})
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, snap]) => {
                const cols = (snap.columns ?? [])
                    .map((c) => `${c.name}:${c.type ?? ""}`)
                    .join(",");
                return `${name}:${snap.rowCount}:${cols}`;
            })
            .join("|");

        return `${viewKey}::${schemaSql}::${snapshotKey}`;
    }, [viewKey, schemaSql, initialTableSnapshots]);

    const fallbackSnapshots = React.useMemo(() => {
        if (initialTableSnapshots && Object.keys(initialTableSnapshots).length > 0) {
            return initialTableSnapshots;
        }
        return buildDefaultTableSnapshots(schema);
    }, [initialTableSnapshots, schema]);

    const [persistedSnapshots, setPersistedSnapshots] =
        React.useState<SqlTableSnapshots>(() => fallbackSnapshots);

    const [acceptedResult, setAcceptedResult] = React.useState<SqlRunResult | null>(null);

    const blockedResultRef = React.useRef<SqlRunResult | null>(null);
    const lastSourceKeyRef = React.useRef<string | null>(null);

    React.useEffect(() => {
        const changed = lastSourceKeyRef.current !== sourceKey;
        if (!changed) return;

        lastSourceKeyRef.current = sourceKey;
        blockedResultRef.current = result ?? null;

        setAcceptedResult(null);
        setPersistedSnapshots(fallbackSnapshots);
        setPositions({});
        setTab(busy ? "results" : "tables");
    }, [sourceKey, fallbackSnapshots, result, busy]);

    React.useEffect(() => {
        if (busy) {
            setTab("results");
            return;
        }

        if (!result) {
            setAcceptedResult(null);
            setPersistedSnapshots(fallbackSnapshots);
            return;
        }

        if (result === blockedResultRef.current) return;

        setAcceptedResult(result);

        if (result.ok) {
            const nextSnapshots = getTableSnapshots(result);
            setPersistedSnapshots(
                Object.keys(nextSnapshots).length > 0 ? nextSnapshots : fallbackSnapshots,
            );
        }
    }, [busy, result, fallbackSnapshots]);

    const tableSnapshots = React.useMemo(() => {
        return Object.keys(persistedSnapshots).length > 0
            ? persistedSnapshots
            : fallbackSnapshots;
    }, [persistedSnapshots, fallbackSnapshots]);

    const tablesMetricsByTable = React.useMemo(() => {
        if (tab !== "tables") return null;

        const map = new Map<string, ReturnType<typeof buildTablePreviewMetrics>>();
        for (const table of schema.tables) {
            map.set(table.id, buildTablePreviewMetrics(table, tableSnapshots));
        }
        return map;
    }, [tab, schema.tables, tableSnapshots]);

    const tablesLayout = React.useMemo(() => {
        if (tab !== "tables" || !tablesMetricsByTable) {
            return { boxes: [], width: 0, height: 0 };
        }
        return buildTablesCanvasLayout(schema.tables, tablesMetricsByTable);
    }, [tab, schema.tables, tablesMetricsByTable]);

    const erdLayout = React.useMemo(() => {
        if (tab !== "erd") {
            return { boxes: [], width: 0, height: 0 };
        }
        return buildTableLayout(schema.tables);
    }, [tab, schema.tables]);

    const chenLayout = React.useMemo(() => {
        if (tab !== "chen") {
            return { boxes: [], width: 0, height: 0 };
        }
        return buildChenLayout(schema.tables);
    }, [tab, schema.tables]);

    React.useEffect(() => {
        if (tab !== "tables") return;
        setPositions((prev) => syncTabDefaults(prev, "tables", tablesLayout.boxes));
    }, [tab, tablesLayout]);

    React.useEffect(() => {
        if (tab !== "erd") return;
        setPositions((prev) => syncTabDefaults(prev, "erd", erdLayout.boxes));
    }, [tab, erdLayout]);

    React.useEffect(() => {
        if (tab !== "chen") return;
        setPositions((prev) => syncTabDefaults(prev, "chen", chenLayout.boxes));
    }, [tab, chenLayout]);

    const handleMove = React.useCallback(
        (diagramTab: DiagramTabKey, id: string, x: number, y: number) => {
            setPositions((prev) => ({
                ...prev,
                [diagramPosKey(diagramTab, id)]: { x, y },
            }));
        },
        [],
    );

    return {
        tab,
        setTab,
        positions,
        tableSnapshots,
        displayResult: acceptedResult,
        handleMove,
    };
}
