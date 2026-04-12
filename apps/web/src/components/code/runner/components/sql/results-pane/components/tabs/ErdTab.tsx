
"use client";

import React from "react";
import { Badge } from "../Badge";
import { EmptySchemaState } from "../EmptySchemaState";
import { PanZoomCanvas } from "../PanZoomCanvas";
import { beginDiagramNodeDrag } from "../../lib/diagram-drag";
import {
    orthogonalPath,
    pickSides,
    sideOf,
} from "../../lib/diagram-geometry";
import {
    applyStoredPositions,
    buildTableLayout,
} from "../../lib/diagram-layout";
import {
    buildDiagramFitKey,
    buildDiagramScene,
    clampDiagramBoxes,
} from "../../lib/diagram-scene";
import type {
    Cardinality,
    DiagramPositions,
    DiagramTabKey,
    SchemaModel,
} from "../../SqlResultsPane.types";

function EndpointMark(props: {
    x: number;
    y: number;
    dx: number;
    dy: number;
    cardinality: Cardinality;
    color?: string;
}) {
    const { x, y, dx, dy, cardinality, color = "#64748b" } = props;
    const px = -dy;
    const py = dx;

    const line = (
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        key: string,
    ) => (
        <line
            key={key}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
        />
    );

    const els: React.ReactNode[] = [];
    let offset = 0;

    if (cardinality === "0..1" || cardinality === "0..many") {
        const cx = x + dx * 8;
        const cy = y + dy * 8;
        els.push(
            <circle
                key="circle"
                cx={cx}
                cy={cy}
                r="4"
                fill="white"
                stroke={color}
                strokeWidth="1.5"
            />,
        );
        offset = 10;
    }

    if (cardinality === "1" || cardinality === "0..1") {
        const bx = x + dx * (10 + offset);
        const by = y + dy * (10 + offset);
        els.push(line(bx + px * 6, by + py * 6, bx - px * 6, by - py * 6, "bar"));
    }

    if (cardinality === "many" || cardinality === "0..many") {
        const bx = x + dx * (10 + offset);
        const by = y + dy * (10 + offset);
        const tx = x + dx * (22 + offset);
        const ty = y + dy * (22 + offset);

        els.push(line(bx, by, tx, ty, "fork-mid"));
        els.push(line(bx + px * 6, by + py * 6, tx, ty, "fork-top"));
        els.push(line(bx - px * 6, by - py * 6, tx, ty, "fork-bottom"));
    }

    return <g>{els}</g>;
}

function CardinalityPill(props: { x: number; y: number; text: string }) {
    const { x, y, text } = props;
    return (
        <g>
            <rect
                x={x - 18}
                y={y - 10}
                rx={8}
                ry={8}
                width={36}
                height={20}
                fill="rgba(255,255,255,0.88)"
                stroke="rgba(100,116,139,0.28)"
            />
            <text
                x={x}
                y={y + 4}
                textAnchor="middle"
                fontSize="11"
                fontWeight="700"
                fill="#475569"
            >
                {text}
            </text>
        </g>
    );
}

export function ErdTab(props: {
    schema: SchemaModel;
    positions: DiagramPositions;
    onMove: (tab: DiagramTabKey, id: string, x: number, y: number) => void;
}) {
    const { schema, positions, onMove } = props;

    const initialLayout = React.useMemo(
        () => buildTableLayout(schema.tables),
        [schema.tables],
    );

    const rawBoxes = React.useMemo(
        () =>
            clampDiagramBoxes(
                "erd",
                applyStoredPositions("erd", initialLayout.boxes, positions),
            ),
        [initialLayout, positions],
    );

    const scene = React.useMemo(
        () => buildDiagramScene(rawBoxes, "erd"),
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
        () => buildDiagramFitKey("erd", schema),
        [schema],
    );

    if (!schema.tables.length) {
        return (
            <EmptySchemaState
                title="No ERD available"
                subtitle="Add schema.sql so the pane can render crow’s-foot relationships."
            />
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <Badge>
                    {schema.tables.length} entity table
                    {schema.tables.length === 1 ? "" : "s"}
                </Badge>
                <Badge tone="warn">
                    {schema.relations.length} crow’s-foot relation
                    {schema.relations.length === 1 ? "" : "s"}
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
                            <svg
                                width={scene.width}
                                height={scene.height}
                                className="absolute inset-0 z-0 overflow-visible"
                                viewBox={`0 0 ${scene.width} ${scene.height}`}
                            >
                                {schema.relations.map((rel) => {
                                    const from = boxById.get(rel.fromTable);
                                    const to = boxById.get(rel.toTable);
                                    if (!from || !to) return null;

                                    const { aSide, bSide } = pickSides(from, to);
                                    const start = sideOf(from, aSide);
                                    const end = sideOf(to, bSide);
                                    const path = orthogonalPath(
                                        start,
                                        end,
                                        aSide === "left" || aSide === "right",
                                    );

                                    return (
                                        <g key={rel.id}>
                                            <path
                                                d={path}
                                                fill="none"
                                                stroke="#94a3b8"
                                                strokeWidth="1.8"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            />
                                            <EndpointMark
                                                x={start.x}
                                                y={start.y}
                                                dx={start.dx}
                                                dy={start.dy}
                                                cardinality={rel.fromCardinality}
                                            />
                                            <EndpointMark
                                                x={end.x}
                                                y={end.y}
                                                dx={end.dx}
                                                dy={end.dy}
                                                cardinality={rel.toCardinality}
                                            />
                                            <CardinalityPill
                                                x={start.x + start.dx * 34}
                                                y={start.y + start.dy * 20}
                                                text={rel.fromCardinality}
                                            />
                                            <CardinalityPill
                                                x={end.x + end.dx * 34}
                                                y={end.y + end.dy * 20}
                                                text={rel.toCardinality}
                                            />
                                            <text
                                                x={(start.x + end.x) / 2}
                                                y={(start.y + end.y) / 2 - 8}
                                                textAnchor="middle"
                                                fontSize="11"
                                                fontWeight="700"
                                                fill="#64748b"
                                            >
                                                {rel.label}
                                            </text>
                                        </g>
                                    );
                                })}
                            </svg>

                            {schema.tables.map((table) => {
                                const rawBox = rawBoxById.get(table.id)!;
                                const box = boxById.get(table.id)!;

                                const onPointerDown = (
                                    e: React.PointerEvent<HTMLDivElement>,
                                ) => {
                                    e.preventDefault();
                                    e.stopPropagation();

                                    beginDiagramNodeDrag({
                                        target: e.currentTarget,
                                        pointerId: e.pointerId,
                                        clientX: e.clientX,
                                        clientY: e.clientY,
                                        scale,
                                        mode: "erd",
                                        tab: "erd",
                                        id: rawBox.id,
                                        startX: rawBox.x,
                                        startY: rawBox.y,
                                        onMove,
                                    });
                                };

                                return (
                                    <div
                                        key={table.id}
                                        className="absolute z-10 overflow-hidden rounded-xl border border-neutral-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-neutral-950"
                                        style={{
                                            left: box.x,
                                            top: box.y,
                                            width: box.w,
                                            height: box.h,
                                        }}
                                    >
                                        <div
                                            data-diagram-node-drag="true"
                                            onPointerDown={onPointerDown}
                                            className="touch-none select-none cursor-grab border-b border-neutral-200/70 bg-neutral-100/90 px-3 py-2.5 active:cursor-grabbing dark:border-white/10 dark:bg-white/[0.05]"
                                        >
                                            <div className="truncate text-sm font-medium text-neutral-900 dark:text-white/90">
                                                {table.name}
                                            </div>
                                        </div>

                                        <div className="divide-y divide-neutral-200/70 dark:divide-white/10">
                                            {table.columns.map((col) => (
                                                <div
                                                    key={col.name}
                                                    className="flex items-center justify-between gap-2 px-3 py-1.5 text-[12px]"
                                                >
                                                    <div className="min-w-0 truncate font-medium text-neutral-800 dark:text-white/85">
                                                        {col.name}
                                                    </div>

                                                    <div className="flex items-center gap-1">
                                                        {col.isPk ? (
                                                            <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-200">
                                PK
                              </span>
                                                        ) : null}
                                                        {col.isFk ? (
                                                            <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-200">
                                FK
                              </span>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            ))}
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
