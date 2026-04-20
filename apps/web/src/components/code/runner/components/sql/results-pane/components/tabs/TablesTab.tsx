
"use client";

import React from "react";
import { Badge } from "../Badge";
import { CellValue } from "../CellValue";
import { EmptySchemaState } from "../EmptySchemaState";
import { PanZoomCanvas } from "../PanZoomCanvas";
import {
    TABLE_PREVIEW_ROW_LIMIT,
    cn,
} from "../../SqlResultsPane.constants";
import { beginDiagramNodeDrag } from "../../lib/diagram-drag";
import {
    applyStoredPositions,
    buildTablesCanvasLayout,
} from "../../lib/diagram-layout";
import {
    buildDiagramFitKey,
    buildDiagramScene,
    clampDiagramBoxes,
} from "../../lib/diagram-scene";
import {
    buildTablePreviewMetrics,
    getSnapshotForTable, TablePreviewMetrics,
} from "../../lib/snapshots";
import type {
    DiagramPositions,
    DiagramTabKey,
    SchemaModel,
    SqlTableSnapshots,
} from "../../SqlResultsPane.types";

export function TablesTab(props: {
    schema: SchemaModel;
    positions: DiagramPositions;
    onMove: (tab: DiagramTabKey, id: string, x: number, y: number) => void;
    tableSnapshots?: SqlTableSnapshots;
}) {
    const { schema, positions, onMove, tableSnapshots = {} } = props;

    const metricsByTable = React.useMemo(() => {
        const map = new Map<string, TablePreviewMetrics>();

        for (const table of schema.tables) {
            map.set(table.id, buildTablePreviewMetrics(table, tableSnapshots));
        }

        return map;
    }, [schema.tables, tableSnapshots]);

    const initialLayout = React.useMemo(
        () => buildTablesCanvasLayout(schema.tables, metricsByTable),
        [schema.tables, metricsByTable],
    );

    const [draggingTableId, setDraggingTableId] = React.useState<string | null>(null);

    const rawBoxes = React.useMemo(
        () =>
            clampDiagramBoxes(
                "tables",
                applyStoredPositions("tables", initialLayout.boxes, positions),
            ),
        [initialLayout, positions],
    );

    const scene = React.useMemo(
        () => buildDiagramScene(rawBoxes, "tables"),
        [rawBoxes],
    );

    const rawBoxById = React.useMemo(
        () => new Map(rawBoxes.map((box) => [box.id, box])),
        [rawBoxes],
    );

    const boxById = React.useMemo(
        () => new Map(scene.boxes.map((box) => [box.id, box])),
        [scene.boxes],
    );

    const fitKey = React.useMemo(
        () => buildDiagramFitKey("tables", schema),
        [schema],
    );

    if (!schema.tables.length) {
        return (
            <EmptySchemaState
                title="No tables available"
                subtitle="Run the SQL lesson with schema and snapshots to show table rows."
            />
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="flex flex-wrap items-center pl-3 gap-2">
                <Badge>
                    {schema.tables.length} table{schema.tables.length === 1 ? "" : "s"}
                </Badge>
            </div>

            <div className="min-h-0 flex-1">
                <PanZoomCanvas
                    width={scene.width}
                    height={scene.height}
                    fitBounds={scene.fitBounds}
                    fitKey={fitKey}
                >
                    {({ scale }) => (
                        <div className="relative h-full w-full overflow-visible">
                            {schema.tables.map((table) => {
                                const rawBox = rawBoxById.get(table.id)!;
                                const isDragging = draggingTableId === rawBox.id;
                                const box = boxById.get(table.id)!;

                                const metrics = metricsByTable.get(table.id)!;
                                const snapshot = getSnapshotForTable(tableSnapshots, table.name);
                                const hasSnapshot = !!snapshot;

                                const displayColumns = metrics.columns;
                                const rows = snapshot?.rows ?? [];
                                const rowCount = snapshot?.rowCount ?? 0;
                                const previewRows = rows.slice(0, TABLE_PREVIEW_ROW_LIMIT);

                                const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
                                    e.preventDefault();
                                    e.stopPropagation();

                                    beginDiagramNodeDrag({
                                        target: e.currentTarget,
                                        pointerId: e.pointerId,
                                        clientX: e.clientX,
                                        clientY: e.clientY,
                                        scale,
                                        mode: "tables",
                                        tab: "tables",
                                        id: rawBox.id,
                                        startX: rawBox.x,
                                        startY: rawBox.y,
                                        onMove,
                                        onDragStart: () => setDraggingTableId(rawBox.id),
                                        onDragEnd: () =>
                                            setDraggingTableId((prev) =>
                                                prev === rawBox.id ? null : prev,
                                            ),
                                    });
                                };

                                return (
                                    <div
                                        key={table.id}
                                        data-diagram-node-drag="true"
                                        onPointerDown={onPointerDown}
                                        className="absolute isolate overflow-hidden rounded-xl border border-neutral-200/70 bg-white/92 touch-none select-none cursor-grab active:cursor-grabbing dark:border-white/10 dark:bg-neutral-950/95"
                                        style={{
                                            left: 0,
                                            top: 0,
                                            width: box.w,
                                            minHeight: box.h,
                                            transform: `translate3d(${box.x}px, ${box.y}px, 0)`,
                                            willChange: isDragging ? "transform" : undefined,
                                            backfaceVisibility: "hidden",
                                            WebkitBackfaceVisibility: "hidden",
                                            contain: "layout paint style",
                                            zIndex: isDragging ? 20 : 1,
                                            boxShadow: isDragging
                                                ? "0 18px 42px rgba(15, 23, 42, 0.18)"
                                                : "0 1px 2px rgba(15, 23, 42, 0.06)",
                                        }}
                                    >
                                        <div className="border-b border-neutral-200/70 bg-neutral-100/85 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.05]">
                                            <div className="text-sm font-medium text-neutral-900 dark:text-white/90">
                                                {table.name}
                                            </div>
                                            <div className="mt-1 text-[11px] font-medium text-neutral-500 dark:text-white/45">
                                                {rowCount} row{rowCount === 1 ? "" : "s"}
                                            </div>
                                        </div>

                                        <div
                                            data-diagram-no-pan="true"
                                            onPointerDown={(e) => e.stopPropagation()}
                                            onWheel={(e) => e.stopPropagation()}
                                            className="min-h-0 cursor-auto select-auto touch-auto"
                                        >
                                            <div
                                                className="max-h-[220px] overflow-auto"
                                                style={{
                                                    transform: "translateZ(0)",
                                                    backfaceVisibility: "hidden",
                                                    WebkitBackfaceVisibility: "hidden",
                                                    contain: "paint",
                                                }}
                                            >
                                                <table
                                                    className="border-collapse table-fixed"
                                                    style={{
                                                        width: Math.max(metrics.tableMinWidth, box.w - 2),
                                                        minWidth: Math.max(metrics.tableMinWidth, box.w - 2),
                                                    }}
                                                >
                                                    <thead className="sticky top-0 z-10 bg-neutral-100/95 backdrop-blur dark:bg-neutral-900/95">
                                                    <tr>
                                                        {displayColumns.map((col, ci) => (
                                                            <th
                                                                key={`${table.id}-col-${col.name}-${ci}`}
                                                                className="border-b border-neutral-200/70 px-3 py-2 text-left align-top text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-500 dark:border-white/10 dark:text-white/50"
                                                                style={{
                                                                    width: col.width,
                                                                    minWidth: col.width,
                                                                    maxWidth: col.width,
                                                                }}
                                                            >
                                                                <div className="flex min-w-0 flex-col items-start gap-1">
                                        <span className="whitespace-normal break-all text-left leading-4">
                                            {col.name}
                                        </span>

                                                                    {col.type ? (
                                                                        <span className="rounded-md border border-neutral-200 bg-white px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-neutral-500 dark:border-white/10 dark:bg-white/[0.06] dark:text-white/40">
                                                {col.type}
                                            </span>
                                                                    ) : null}
                                                                </div>
                                                            </th>
                                                        ))}
                                                    </tr>
                                                    </thead>

                                                    <tbody>
                                                    {hasSnapshot ? (
                                                        previewRows.length ? (
                                                            previewRows.map((row, ri) => (
                                                                <tr
                                                                    key={ri}
                                                                    className={cn(
                                                                        "border-b border-neutral-200/70 last:border-b-0 dark:border-white/10",
                                                                        ri % 2 === 0
                                                                            ? "bg-white/70 dark:bg-transparent"
                                                                            : "bg-neutral-50/70 dark:bg-white/[0.02]",
                                                                    )}
                                                                >
                                                                    {displayColumns.map((col, ci) => (
                                                                        <td
                                                                            key={`${ri}-${ci}`}
                                                                            className="px-3 py-2 align-top text-xs text-neutral-800 dark:text-white/85"
                                                                            style={{
                                                                                width: col.width,
                                                                                minWidth: col.width,
                                                                                maxWidth: col.width,
                                                                            }}
                                                                        >
                                                                            <div className="break-words font-mono leading-5">
                                                                                <CellValue value={row[ci]} />
                                                                            </div>
                                                                        </td>
                                                                    ))}
                                                                </tr>
                                                            ))
                                                        ) : (
                                                            <tr>
                                                                <td
                                                                    colSpan={Math.max(1, displayColumns.length)}
                                                                    className="px-3 py-6 text-center text-sm text-neutral-500 dark:text-white/45"
                                                                >
                                                                    Table has no rows.
                                                                </td>
                                                            </tr>
                                                        )
                                                    ) : (
                                                        <tr>
                                                            <td
                                                                colSpan={Math.max(1, displayColumns.length)}
                                                                className="px-3 py-6 text-center text-sm text-neutral-500 dark:text-white/45"
                                                            >
                                                                Run a query once to load table rows.
                                                            </td>
                                                        </tr>
                                                    )}
                                                    </tbody>
                                                </table>

                                                {hasSnapshot && rowCount > TABLE_PREVIEW_ROW_LIMIT ? (
                                                    <div className="border-t border-neutral-200/70 px-3 py-2 text-[11px] text-neutral-500 dark:border-white/10 dark:text-white/45">
                                                        Showing {TABLE_PREVIEW_ROW_LIMIT} of {rowCount} rows
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </PanZoomCanvas>
            </div>
        </div>
    );
}
