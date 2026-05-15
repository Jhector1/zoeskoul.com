"use client";

import React from "react";
import type { SqlRunResult } from "@/lib/code/types";
import {
    diagramPosKey,
} from "../lib/diagram-layout";
import {
    buildDefaultTableSnapshots,
} from "../lib/snapshots";
import type {
    DiagramPositions,
    DiagramTabKey,
    SchemaModel,
    SqlPaneOptions,
    SqlTableSnapshots,
    TabKey,
} from "../SqlResultsPane.types";
import { getTableSnapshots } from "../lib/snapshots";

function buildSnapshotsKey(snapshots: SqlTableSnapshots | undefined) {
    return Object.entries(snapshots ?? {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, snap]) => {
            const cols = (snap.columns ?? [])
                .map((c) => `${c.name}:${c.type ?? ""}`)
                .join(",");
            const rows = (snap.rows ?? [])
                .map((row) => row.map((cell) => JSON.stringify(cell)).join(","))
                .join(";");
            return `${name}:${snap.rowCount}:${cols}:${rows}`;
        })
        .join("|");
}

function positionsAreEmpty(positions: DiagramPositions) {
    return Object.keys(positions).length === 0;
}

export function useSqlResultsPaneState(args: {
    result: SqlRunResult | null;
    busy: boolean;
    schema: SchemaModel;
    schemaSql: string;
    initialTableSnapshots?: SqlTableSnapshots;
    viewKey?: string;
    paneOptions?: SqlPaneOptions;
}) {
    const {
        result,
        busy,
        schema,
        schemaSql,
        initialTableSnapshots,
        viewKey = "",
        paneOptions,
    } = args;

    const availableTabs = React.useMemo<TabKey[]>(() => {
        const showResults = paneOptions?.showResults !== false;
        const showTables = paneOptions?.showTables !== false;
        const showErd = Boolean(
            paneOptions?.showErd ??
            paneOptions?.showCrowFoot ??
            paneOptions?.showCrowfoot ??
            paneOptions?.showCrowsFoot
        );
        const showChen = paneOptions?.showChen === true;

        const tabs: TabKey[] = [];
        if (showResults) tabs.push("results");
        if (showTables) tabs.push("tables");
        if (showErd) tabs.push("erd");
        if (showChen) tabs.push("chen");
        return tabs.length > 0 ? tabs : ["results", "tables"];
    }, [paneOptions]);

    const defaultTab = React.useMemo<TabKey>(() => {
        const requested = paneOptions?.defaultTab;
        if (requested && availableTabs.includes(requested)) return requested;
        if (availableTabs.includes("tables")) return "tables";
        return availableTabs[0] ?? "results";
    }, [availableTabs, paneOptions?.defaultTab]);

    const [tab, rawSetTab] = React.useState<TabKey>(defaultTab);
    const setTab = React.useCallback((next: TabKey) => {
        rawSetTab(availableTabs.includes(next) ? next : defaultTab);
    }, [availableTabs, defaultTab]);
    const [positions, setPositions] = React.useState<DiagramPositions>({});

    const sourceKey = React.useMemo(() => {
        const snapshotKey = buildSnapshotsKey(initialTableSnapshots);

        return `${viewKey}::${schemaSql}::${snapshotKey}`;
    }, [viewKey, schemaSql, initialTableSnapshots]);

    const fallbackSnapshots = React.useMemo(() => {
        if (initialTableSnapshots && Object.keys(initialTableSnapshots).length > 0) {
            return initialTableSnapshots;
        }
        return buildDefaultTableSnapshots(schema);
    }, [initialTableSnapshots, schema]);
    const fallbackSnapshotsKey = React.useMemo(
        () => buildSnapshotsKey(fallbackSnapshots),
        [fallbackSnapshots],
    );

    const [persistedSnapshots, setPersistedSnapshots] =
        React.useState<SqlTableSnapshots>(() => fallbackSnapshots);
    const resetTab = React.useMemo<TabKey>(
        () => (busy && availableTabs.includes("results") ? "results" : defaultTab),
        [busy, availableTabs, defaultTab],
    );

    const [acceptedResult, setAcceptedResult] = React.useState<SqlRunResult | null>(null);

    const blockedResultRef = React.useRef<SqlRunResult | null>(null);
    const lastSourceKeyRef = React.useRef<string | null>(null);

    React.useEffect(() => {
        const changed = lastSourceKeyRef.current !== sourceKey;
        if (!changed) return;

        lastSourceKeyRef.current = sourceKey;
        blockedResultRef.current = result ?? null;

        setAcceptedResult((prev) => (prev === null ? prev : null));
        setPersistedSnapshots((prev) =>
            buildSnapshotsKey(prev) === fallbackSnapshotsKey ? prev : fallbackSnapshots,
        );
        setPositions((prev) => (positionsAreEmpty(prev) ? prev : {}));
        rawSetTab((prev) => (prev === resetTab ? prev : resetTab));
    }, [sourceKey, fallbackSnapshots, fallbackSnapshotsKey, resetTab, result]);

    React.useEffect(() => {
        if (!availableTabs.includes(tab)) {
            rawSetTab(defaultTab);
        }
    }, [availableTabs, defaultTab, tab]);




    React.useEffect(() => {
        if (busy) {
            setTab(availableTabs.includes("results") ? "results" : defaultTab);
            return;
        }

        if (!result) {
            setAcceptedResult((prev) => (prev === null ? prev : null));

            setPersistedSnapshots((prev) =>
                buildSnapshotsKey(prev) === fallbackSnapshotsKey
                    ? prev
                    : fallbackSnapshots,
            );

            return;
        }

        if (result === blockedResultRef.current) return;

        setAcceptedResult((prev) => (prev === result ? prev : result));

        if (result.ok) {
            const nextSnapshots = getTableSnapshots(result);
            const nextPersistedSnapshots =
                Object.keys(nextSnapshots).length > 0
                    ? nextSnapshots
                    : fallbackSnapshots;

            const nextKey = buildSnapshotsKey(nextPersistedSnapshots);

            setPersistedSnapshots((prev) =>
                buildSnapshotsKey(prev) === nextKey
                    ? prev
                    : nextPersistedSnapshots,
            );
        }
    }, [
        busy,
        result,
        fallbackSnapshots,
        fallbackSnapshotsKey,
        availableTabs,
        defaultTab,
        setTab,
    ]);



    const tableSnapshots = React.useMemo(() => {
        return Object.keys(persistedSnapshots).length > 0
            ? persistedSnapshots
            : fallbackSnapshots;
    }, [persistedSnapshots, fallbackSnapshots]);

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
        availableTabs,
    };
}
