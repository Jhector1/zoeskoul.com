
"use client";

import React from "react";
import { Badge } from "../Badge";
import { EmptySchemaState } from "../EmptySchemaState";
import { PanZoomCanvas } from "../PanZoomCanvas";
import { beginDiagramNodeDrag } from "../../lib/diagram-drag";
import {
    applyStoredPositions,
    buildChenLayout,
} from "../../lib/diagram-layout";
import {
    buildDiagramFitKey,
    buildDiagramScene,
    clampDiagramBoxes,
} from "../../lib/diagram-scene";
import type {
    DiagramPositions,
    DiagramTabKey,
    SchemaModel,
} from "../../SqlResultsPane.types";

export function ChenTab(props: {
    schema: SchemaModel;
    positions: DiagramPositions;
    onMove: (tab: DiagramTabKey, id: string, x: number, y: number) => void;
}) {
    const { schema, positions, onMove } = props;

    const initialLayout = React.useMemo(
        () => buildChenLayout(schema.tables),
        [schema.tables],
    );

    const rawBoxes = React.useMemo(
        () =>
            clampDiagramBoxes(
                "chen",
                applyStoredPositions("chen", initialLayout.boxes, positions),
            ),
        [initialLayout, positions],
    );

    const scene = React.useMemo(
        () => buildDiagramScene(rawBoxes, "chen"),
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

    const entities = React.useMemo(
        () =>
            schema.tables.map((table) => {
                const box = boxById.get(table.id)!;
                return { ...box, table };
            }),
        [schema.tables, boxById],
    );

    const entityById = React.useMemo(
        () => new Map(entities.map((e) => [e.id, e])),
        [entities],
    );

    const fitKey = React.useMemo(
        () => buildDiagramFitKey("chen", schema),
        [schema],
    );

    if (!schema.tables.length) {
        return (
            <EmptySchemaState
                title="No Chen diagram available"
                subtitle="Add schema.sql so the pane can render entities, relationships, and attributes."
            />
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <Badge>{schema.tables.length} entities</Badge>
                <Badge tone="warn">{schema.relations.length} relationships</Badge>
            </div>

            <div className="min-h-0 flex-1">
                <PanZoomCanvas
                    width={scene.width}
                    height={scene.height}
                    fitBounds={scene.fitBounds}
                    fitKey={fitKey}
                >
                    {({ scale }) => (
                        <svg
                            width={scene.width}
                            height={scene.height}
                            viewBox={`0 0 ${scene.width} ${scene.height}`}
                            className="block overflow-visible"
                        >
                            {schema.relations.map((rel) => {
                                const from = entityById.get(rel.fromTable);
                                const to = entityById.get(rel.toTable);
                                if (!from || !to) return null;

                                const fx = from.x + from.w / 2;
                                const fy = from.y + from.h / 2;
                                const tx = to.x + to.w / 2;
                                const ty = to.y + to.h / 2;
                                const mx = (fx + tx) / 2;
                                const my = (fy + ty) / 2;

                                return (
                                    <g key={rel.id}>
                                        <line
                                            x1={fx}
                                            y1={fy}
                                            x2={mx - 34}
                                            y2={my}
                                            stroke="#94a3b8"
                                            strokeWidth="1.7"
                                        />
                                        <line
                                            x1={mx + 34}
                                            y1={my}
                                            x2={tx}
                                            y2={ty}
                                            stroke="#94a3b8"
                                            strokeWidth="1.7"
                                        />

                                        <polygon
                                            points={`${mx},${my - 24} ${mx + 34},${my} ${mx},${my + 24} ${mx - 34},${my}`}
                                            fill="white"
                                            stroke="#94a3b8"
                                            strokeWidth="1.7"
                                        />
                                        <text
                                            x={mx}
                                            y={my + 4}
                                            textAnchor="middle"
                                            fontSize="11"
                                            fontWeight="700"
                                            fill="#334155"
                                        >
                                            {rel.label}
                                        </text>

                                        <text
                                            x={fx + (mx > fx ? 20 : -20)}
                                            y={fy - 8}
                                            textAnchor="middle"
                                            fontSize="11"
                                            fontWeight="700"
                                            fill="#64748b"
                                        >
                                            {rel.fromCardinality}
                                        </text>
                                        <text
                                            x={tx + (mx > tx ? 20 : -20)}
                                            y={ty - 8}
                                            textAnchor="middle"
                                            fontSize="11"
                                            fontWeight="700"
                                            fill="#64748b"
                                        >
                                            {rel.toCardinality}
                                        </text>
                                    </g>
                                );
                            })}

                            {entities.map((entity) => {
                                const rawBox = rawBoxById.get(entity.id)!;
                                const attrs = entity.table.columns.slice(0, 10);
                                const hiddenCount = Math.max(
                                    0,
                                    entity.table.columns.length - attrs.length,
                                );

                                const onPointerDown = (e: React.PointerEvent<SVGGElement>) => {
                                    e.preventDefault();
                                    e.stopPropagation();

                                    beginDiagramNodeDrag({
                                        target: e.currentTarget,
                                        pointerId: e.pointerId,
                                        clientX: e.clientX,
                                        clientY: e.clientY,
                                        scale,
                                        mode: "chen",
                                        tab: "chen",
                                        id: rawBox.id,
                                        startX: rawBox.x,
                                        startY: rawBox.y,
                                        onMove,
                                    });
                                };

                                return (
                                    <g key={entity.id}>
                                        <g
                                            data-diagram-node-drag="true"
                                            onPointerDown={onPointerDown}
                                            className="cursor-grab active:cursor-grabbing"
                                            style={{ touchAction: "none" }}
                                        >
                                            <rect
                                                x={entity.x}
                                                y={entity.y}
                                                width={entity.w}
                                                height={entity.h}
                                                rx={10}
                                                fill="white"
                                                stroke="#cbd5e1"
                                                strokeWidth="1.5"
                                            />
                                            <text
                                                x={entity.x + entity.w / 2}
                                                y={entity.y + 29}
                                                textAnchor="middle"
                                                fontSize="13"
                                                fontWeight="700"
                                                fill="#0f172a"
                                            >
                                                {entity.table.name}
                                            </text>
                                        </g>

                                        {attrs.map((col, i) => {
                                            const side = i % 2 === 0 ? "left" : "right";
                                            const row = Math.floor(i / 2);
                                            const cx =
                                                side === "left"
                                                    ? entity.x - 90
                                                    : entity.x + entity.w + 90;
                                            const cy = entity.y + 18 + row * 38;
                                            const lineEndX =
                                                side === "left" ? entity.x : entity.x + entity.w;

                                            return (
                                                <g key={col.name}>
                                                    <line
                                                        x1={lineEndX}
                                                        y1={entity.y + entity.h / 2}
                                                        x2={cx}
                                                        y2={cy}
                                                        stroke="#cbd5e1"
                                                        strokeWidth="1.4"
                                                    />
                                                    <ellipse
                                                        cx={cx}
                                                        cy={cy}
                                                        rx="64"
                                                        ry="18"
                                                        fill="white"
                                                        stroke="#cbd5e1"
                                                        strokeWidth="1.4"
                                                    />
                                                    <text
                                                        x={cx}
                                                        y={cy + 4}
                                                        textAnchor="middle"
                                                        fontSize="11"
                                                        fontWeight={col.isPk ? 700 : 600}
                                                        fill="#334155"
                                                    >
                                                        {col.name}
                                                    </text>
                                                </g>
                                            );
                                        })}

                                        {hiddenCount > 0 ? (
                                            <g>
                                                <line
                                                    x1={entity.x + entity.w / 2}
                                                    y1={entity.y + entity.h}
                                                    x2={entity.x + entity.w / 2}
                                                    y2={entity.y + entity.h + 26}
                                                    stroke="#cbd5e1"
                                                    strokeWidth="1.4"
                                                />
                                                <ellipse
                                                    cx={entity.x + entity.w / 2}
                                                    cy={entity.y + entity.h + 44}
                                                    rx="56"
                                                    ry="18"
                                                    fill="white"
                                                    stroke="#cbd5e1"
                                                    strokeWidth="1.4"
                                                />
                                                <text
                                                    x={entity.x + entity.w / 2}
                                                    y={entity.y + entity.h + 48}
                                                    textAnchor="middle"
                                                    fontSize="11"
                                                    fontWeight="700"
                                                    fill="#334155"
                                                >
                                                    +{hiddenCount} more
                                                </text>
                                            </g>
                                        ) : null}
                                    </g>
                                );
                            })}
                        </svg>
                    )}
                </PanZoomCanvas>
            </div>
        </div>
    );
}
