"use client";

import React from "react";
import type { SqlRunResult } from "@/lib/code/types";

function cn(...xs: Array<string | false | null | undefined>) {
    return xs.filter(Boolean).join(" ");
}

type TabKey = "results" | "tables" | "erd" | "chen";
type Cardinality = "1" | "0..1" | "many" | "0..many";

type ColumnModel = {
    name: string;
    type: string;
    nullable: boolean;
    isPk: boolean;
    isFk: boolean;
    isUnique: boolean;
    references?: {
        table: string;
        column: string;
    };
};

type TableModel = {
    id: string;
    name: string;
    columns: ColumnModel[];
};

type RelationModel = {
    id: string;
    fromTable: string;
    fromColumn: string;
    toTable: string;
    toColumn: string;
    fromCardinality: Cardinality;
    toCardinality: Cardinality;
    label: string;
};

type SchemaModel = {
    tables: TableModel[];
    relations: RelationModel[];
};

type Box = {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
};

type DiagramTabKey = "tables" | "erd" | "chen";
type DiagramMode = DiagramTabKey;
type DiagramPositions = Record<string, { x: number; y: number }>;

type DiagramScene = {
    width: number;
    height: number;
    boxes: Box[];
};

function diagramPosKey(tab: DiagramTabKey, id: string) {
    return `${tab}:${id}`;
}

function buildChenLayout(tables: TableModel[]) {
    const entityW = 170;
    const entityH = 48;
    const gapX = 180;
    const gapY = 180;
    const cols = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, tables.length))));

    const boxes: Box[] = tables.map((table, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);

        return {
            id: table.id,
            x: 220 + col * (entityW + gapX),
            y: 120 + row * (entityH + gapY),
            w: entityW,
            h: entityH,
        };
    });

    const width =
        boxes.length > 0 ? Math.max(...boxes.map((b) => b.x + b.w + 220)) : 900;
    const height =
        boxes.length > 0 ? Math.max(...boxes.map((b) => b.y + b.h + 220)) : 620;

    return { boxes, width, height };
}

function applyStoredPositions(
    tab: DiagramTabKey,
    defaults: Box[],
    positions: DiagramPositions,
) {
    return defaults.map((box) => {
        const saved = positions[diagramPosKey(tab, box.id)];
        return saved ? { ...box, x: saved.x, y: saved.y } : box;
    });
}

function syncTabDefaults(
    prev: DiagramPositions,
    tab: DiagramTabKey,
    defaults: Box[],
): DiagramPositions {
    const next = { ...prev };
    const valid = new Set(defaults.map((b) => diagramPosKey(tab, b.id)));

    for (const key of Object.keys(next)) {
        if (key.startsWith(`${tab}:`) && !valid.has(key)) {
            delete next[key];
        }
    }

    for (const box of defaults) {
        const key = diagramPosKey(tab, box.id);
        if (!next[key]) {
            next[key] = { x: box.x, y: box.y };
        }
    }

    return next;
}

function getDiagramConfig(mode: DiagramMode) {
    if (mode === "chen") {
        return {
            minX: 220,
            minY: 120,
            minWidth: 1500,
            minHeight: 980,
            rightPad: 320,
            bottomPad: 260,
            extraRight: 170,
            extraBottom: 110,
        };
    }

    if (mode === "erd") {
        return {
            minX: 120,
            minY: 80,
            minWidth: 1320,
            minHeight: 860,
            rightPad: 260,
            bottomPad: 180,
            extraRight: 70,
            extraBottom: 40,
        };
    }

    return {
        minX: 40,
        minY: 40,
        minWidth: 1100,
        minHeight: 760,
        rightPad: 180,
        bottomPad: 140,
        extraRight: 0,
        extraBottom: 0,
    };
}

function clampDiagramNodePosition(mode: DiagramMode, x: number, y: number) {
    const cfg = getDiagramConfig(mode);
    return {
        x: Math.max(cfg.minX, x),
        y: Math.max(cfg.minY, y),
    };
}

function clampDiagramBoxes(mode: DiagramMode, boxes: Box[]) {
    return boxes.map((box) => {
        const next = clampDiagramNodePosition(mode, box.x, box.y);
        return { ...box, x: next.x, y: next.y };
    });
}

function buildDiagramScene(rawBoxes: Box[], mode: DiagramMode): DiagramScene {
    const cfg = getDiagramConfig(mode);

    if (!rawBoxes.length) {
        return {
            width: cfg.minWidth,
            height: cfg.minHeight,
            boxes: [],
        };
    }

    const maxX = Math.max(
        ...rawBoxes.map((b) => b.x + b.w + cfg.extraRight),
    );
    const maxY = Math.max(
        ...rawBoxes.map((b) => b.y + b.h + cfg.extraBottom),
    );

    return {
        width: Math.max(cfg.minWidth, maxX + cfg.rightPad),
        height: Math.max(cfg.minHeight, maxY + cfg.bottomPad),
        boxes: rawBoxes,
    };
}

function buildDiagramFitKey(mode: DiagramMode, schema: SchemaModel) {
    const tablesKey = schema.tables
        .map((t) => `${t.id}:${t.columns.length}`)
        .join("|");
    const relsKey = schema.relations.map((r) => r.id).join("|");
    return `${mode}::${tablesKey}::${relsKey}`;
}



type PanZoomCanvasProps = {
    width: number;
    height: number;
    fitKey?: string | number;
    children: (ctx: { scale: number }) => React.ReactNode;
};

function clampScale(n: number) {
    return Math.max(0.35, Math.min(2.5, n));
}

function PanZoomCanvas(props: PanZoomCanvasProps) {
    const { width, height, fitKey, children } = props;

    const viewportRef = React.useRef<HTMLDivElement | null>(null);

    const BOARD_PAD = 1400;
    const OVERSCROLL = 180;

    const stageWidth = width + BOARD_PAD * 2;
    const stageHeight = height + BOARD_PAD * 2;

    const [view, setView] = React.useState({
        scale: 1,
        x: 0,
        y: 0,
    });
    const [isPanning, setIsPanning] = React.useState(false);

    const viewRef = React.useRef(view);
    React.useEffect(() => {
        viewRef.current = view;
    }, [view]);

    const dragRef = React.useRef<{
        pointerId: number;
        startClientX: number;
        startClientY: number;
        startX: number;
        startY: number;
    } | null>(null);

    const rafRef = React.useRef<number | null>(null);
    const pendingRef = React.useRef<{ x: number; y: number } | null>(null);

    const getViewportSize = React.useCallback(() => {
        const el = viewportRef.current;
        if (!el) return { vw: 0, vh: 0 };
        return { vw: el.clientWidth, vh: el.clientHeight };
    }, []);

    const clampOffset = React.useCallback(
        (raw: { x: number; y: number }, nextScale: number) => {
            const { vw, vh } = getViewportSize();
            if (!vw || !vh) return raw;

            const scaledStageW = stageWidth * nextScale;
            const scaledStageH = stageHeight * nextScale;

            const minX = vw - scaledStageW - OVERSCROLL;
            const maxX = OVERSCROLL;
            const minY = vh - scaledStageH - OVERSCROLL;
            const maxY = OVERSCROLL;

            return {
                x: Math.min(maxX, Math.max(minX, raw.x)),
                y: Math.min(maxY, Math.max(minY, raw.y)),
            };
        },
        [getViewportSize, stageWidth, stageHeight],
    );

    const applyView = React.useCallback(
        (next: { scale: number; x: number; y: number }) => {
            viewRef.current = next;
            setView(next);
        },
        [],
    );

    const getFitScale = React.useCallback(() => {
        const { vw, vh } = getViewportSize();
        if (!vw || !vh) return 1;

        return clampScale(Math.min((vw - 48) / width, (vh - 48) / height));
    }, [getViewportSize, width, height]);

    const fitToView = React.useCallback(() => {
        const { vw, vh } = getViewportSize();
        const nextScale = getFitScale();

        if (!vw || !vh) {
            applyView({ scale: nextScale, x: 0, y: 0 });
            return;
        }

        const raw = {
            x: (vw - width * nextScale) / 2 - BOARD_PAD * nextScale,
            y: (vh - height * nextScale) / 2 - BOARD_PAD * nextScale,
        };

        const clamped = clampOffset(raw, nextScale);
        applyView({
            scale: nextScale,
            x: clamped.x,
            y: clamped.y,
        });
    }, [getViewportSize, getFitScale, width, height, clampOffset, applyView]);

    const fitToViewRef = React.useRef(fitToView);
    fitToViewRef.current = fitToView;

    React.useLayoutEffect(() => {
        fitToViewRef.current();
    }, [fitKey]);

    React.useEffect(() => {
        const el = viewportRef.current;
        if (!el || typeof ResizeObserver === "undefined") return;

        const ro = new ResizeObserver(() => {
            const current = viewRef.current;
            const clamped = clampOffset(
                { x: current.x, y: current.y },
                current.scale,
            );

            if (clamped.x !== current.x || clamped.y !== current.y) {
                applyView({
                    ...current,
                    x: clamped.x,
                    y: clamped.y,
                });
            }
        });

        ro.observe(el);
        return () => ro.disconnect();
    }, [clampOffset, applyView]);

    React.useEffect(() => {
        return () => {
            if (rafRef.current != null) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, []);

    const flushPendingPan = React.useCallback(() => {
        rafRef.current = null;
        const pending = pendingRef.current;
        if (!pending) return;

        const current = viewRef.current;
        applyView({
            ...current,
            x: pending.x,
            y: pending.y,
        });
    }, [applyView]);

    const zoomBy = React.useCallback(
        (nextScale: number, clientX?: number, clientY?: number) => {
            const el = viewportRef.current;
            const current = viewRef.current;
            const clampedScale = clampScale(nextScale);

            if (!el || clientX == null || clientY == null) {
                const clampedOffset = clampOffset(
                    { x: current.x, y: current.y },
                    clampedScale,
                );

                applyView({
                    scale: clampedScale,
                    x: clampedOffset.x,
                    y: clampedOffset.y,
                });
                return;
            }

            const rect = el.getBoundingClientRect();
            const px = clientX - rect.left;
            const py = clientY - rect.top;

            const worldX = (px - current.x) / current.scale;
            const worldY = (py - current.y) / current.scale;

            const raw = {
                x: px - worldX * clampedScale,
                y: py - worldY * clampedScale,
            };

            const clampedOffset = clampOffset(raw, clampedScale);

            applyView({
                scale: clampedScale,
                x: clampedOffset.x,
                y: clampedOffset.y,
            });
        },
        [clampOffset, applyView],
    );

    const zoomCentered = React.useCallback(
        (nextScale: number) => {
            const el = viewportRef.current;
            if (!el) {
                const current = viewRef.current;
                const clampedScale = clampScale(nextScale);
                const clampedOffset = clampOffset(
                    { x: current.x, y: current.y },
                    clampedScale,
                );

                applyView({
                    scale: clampedScale,
                    x: clampedOffset.x,
                    y: clampedOffset.y,
                });
                return;
            }

            const rect = el.getBoundingClientRect();
            zoomBy(
                nextScale,
                rect.left + rect.width / 2,
                rect.top + rect.height / 2,
            );
        },
        [zoomBy, clampOffset, applyView],
    );

    const resetView = React.useCallback(() => {
        fitToView();
    }, [fitToView]);

    const onWheel = React.useCallback(
        (e: React.WheelEvent<HTMLDivElement>) => {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.08 : 0.92;
            zoomBy(viewRef.current.scale * factor, e.clientX, e.clientY);
        },
        [zoomBy],
    );

    const onPointerDown = React.useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            if (e.button !== 0) return;

            e.preventDefault();

            dragRef.current = {
                pointerId: e.pointerId,
                startClientX: e.clientX,
                startClientY: e.clientY,
                startX: viewRef.current.x,
                startY: viewRef.current.y,
            };

            setIsPanning(true);
            e.currentTarget.setPointerCapture(e.pointerId);
        },
        [],
    );

    const onPointerMove = React.useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== e.pointerId) return;

            const raw = {
                x: drag.startX + (e.clientX - drag.startClientX),
                y: drag.startY + (e.clientY - drag.startClientY),
            };

            pendingRef.current = clampOffset(raw, viewRef.current.scale);

            if (rafRef.current == null) {
                rafRef.current = requestAnimationFrame(flushPendingPan);
            }
        },
        [clampOffset, flushPendingPan],
    );

    const endPan = React.useCallback((pointerId: number, target: HTMLDivElement) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== pointerId) return;

        dragRef.current = null;
        pendingRef.current = null;

        if (rafRef.current != null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }

        if (target.hasPointerCapture(pointerId)) {
            target.releasePointerCapture(pointerId);
        }

        setIsPanning(false);
    }, []);

    const onPointerUp = React.useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            endPan(e.pointerId, e.currentTarget);
        },
        [endPan],
    );

    const onPointerCancel = React.useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            endPan(e.pointerId, e.currentTarget);
        },
        [endPan],
    );

    return (
        <div className="relative h-full min-h-0 overflow-hidden rounded-2xl border border-neutral-200/70 bg-white/85 dark:border-white/10 dark:bg-black/20">
            <div
                ref={viewportRef}
                className={cn(
                    "absolute inset-0 overflow-hidden touch-none select-none",
                    isPanning ? "cursor-grabbing" : "cursor-grab",
                )}
                onWheel={onWheel}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
            >
                <div
                    className="absolute left-0 top-0 will-change-transform"
                    style={{
                        width: stageWidth,
                        height: stageHeight,
                        transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
                        transformOrigin: "0 0",
                        backgroundImage: `
                          linear-gradient(to right, rgba(148,163,184,0.12) 1px, transparent 1px),
                          linear-gradient(to bottom, rgba(148,163,184,0.12) 1px, transparent 1px)
                        `,
                        backgroundSize: "40px 40px",
                    }}
                >
                    <div
                        className="absolute"
                        style={{
                            left: BOARD_PAD,
                            top: BOARD_PAD,
                            width,
                            height,
                        }}
                    >
                        {children({ scale: view.scale })}
                    </div>
                </div>
            </div>

            <div className="absolute right-3 top-3 z-30 flex items-center gap-2 rounded-xl border border-neutral-200/70 bg-white/90 px-2 py-2 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/55">
                <button
                    type="button"
                    onClick={() => zoomCentered(view.scale * 0.9)}
                    className="rounded-lg border border-neutral-200 px-2 py-1 text-xs font-black text-neutral-700 hover:bg-neutral-50 dark:border-white/10 dark:text-white/80 dark:hover:bg-white/[0.08]"
                >
                    −
                </button>

                <div className="min-w-[56px] text-center text-[11px] font-black text-neutral-600 dark:text-white/70">
                    {Math.round(view.scale * 100)}%
                </div>

                <button
                    type="button"
                    onClick={() => zoomCentered(view.scale * 1.1)}
                    className="rounded-lg border border-neutral-200 px-2 py-1 text-xs font-black text-neutral-700 hover:bg-neutral-50 dark:border-white/10 dark:text-white/80 dark:hover:bg-white/[0.08]"
                >
                    +
                </button>

                <button
                    type="button"
                    onClick={resetView}
                    className="rounded-lg border border-neutral-200 px-2 py-1 text-[11px] font-black text-neutral-700 hover:bg-neutral-50 dark:border-white/10 dark:text-white/80 dark:hover:bg-white/[0.08]"
                >
                    Reset
                </button>
            </div>

            <div className="absolute bottom-3 left-3 z-30 rounded-xl border border-neutral-200/70 bg-white/90 px-3 py-2 text-[11px] font-semibold text-neutral-500 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/55 dark:text-white/50">
                Drag anywhere on the board • wheel to zoom • drag nodes to reposition
            </div>
        </div>
    );
}




function Badge(props: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "bad" }) {
    const { children, tone = "neutral" } = props;

    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black",
                tone === "neutral" &&
                "border-neutral-200 bg-white text-neutral-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-white/80",
                tone === "good" &&
                "border-emerald-300/30 bg-emerald-300/10 text-emerald-800 dark:text-emerald-200",
                tone === "warn" &&
                "border-amber-300/30 bg-amber-300/10 text-amber-800 dark:text-amber-200",
                tone === "bad" &&
                "border-rose-300/30 bg-rose-300/10 text-rose-800 dark:text-rose-200",
            )}
        >
            {children}
        </span>
    );
}

function TabButton(props: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    const { active, onClick, children } = props;

    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "inline-flex items-center rounded-xl border px-3 py-2 text-xs font-black transition",
                active
                    ? "border-sky-300/30 bg-sky-300/10 text-neutral-900 dark:text-white/90"
                    : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-white/75 dark:hover:bg-white/[0.10]",
            )}
        >
            {children}
        </button>
    );
}

function CellValue({ value }: { value: unknown }) {
    if (value == null) {
        return (
            <span className="inline-flex rounded-md border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-[11px] font-bold text-neutral-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/40">
                NULL
            </span>
        );
    }

    if (typeof value === "boolean") {
        return <span>{value ? "true" : "false"}</span>;
    }

    return <span>{String(value)}</span>;
}

function normalizeIdent(raw: string) {
    const s = String(raw ?? "").trim();
    const unwrapped = s
        .replace(/^"(.*)"$/s, "$1")
        .replace(/^`(.*)`$/s, "$1")
        .replace(/^\[(.*)\]$/s, "$1");

    const last = unwrapped.split(".").filter(Boolean).pop() ?? unwrapped;
    return last.trim();
}

function splitTopLevel(input: string) {
    const out: string[] = [];
    let cur = "";
    let depth = 0;
    let quote: "'" | '"' | "`" | null = null;

    for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        const prev = input[i - 1];

        if (quote) {
            cur += ch;
            if (ch === quote && prev !== "\\") quote = null;
            continue;
        }

        if (ch === "'" || ch === '"' || ch === "`") {
            quote = ch;
            cur += ch;
            continue;
        }

        if (ch === "(") {
            depth++;
            cur += ch;
            continue;
        }

        if (ch === ")") {
            depth = Math.max(0, depth - 1);
            cur += ch;
            continue;
        }

        if (ch === "," && depth === 0) {
            if (cur.trim()) out.push(cur.trim());
            cur = "";
            continue;
        }

        cur += ch;
    }

    if (cur.trim()) out.push(cur.trim());
    return out;
}

function parseType(def: string) {
    const match = String(def).match(
        /^(.+?)(?=\s+(?:not\s+null|null|primary\s+key|references|unique|default|check|collate|constraint)\b|$)/i,
    );
    return (match?.[1] ?? def).trim();
}

function parseSchemaSql(schemaSql?: string | null): SchemaModel {
    const text = String(schemaSql ?? "");
    if (!text.trim()) {
        return { tables: [], relations: [] };
    }

    const tableMap = new Map<string, TableModel>();
    const relations: RelationModel[] = [];

    const createRe =
        /create\s+table\s+(?:if\s+not\s+exists\s+)?([^\s(]+)\s*\(([\s\S]*?)\)\s*;/gi;

    for (const match of text.matchAll(createRe)) {
        const rawTableName = match[1] ?? "";
        const body = match[2] ?? "";
        const tableName = normalizeIdent(rawTableName);

        const table: TableModel = {
            id: tableName,
            name: tableName,
            columns: [],
        };

        const pendingPk = new Set<string>();
        const parts = splitTopLevel(body);

        for (const rawPart of parts) {
            const part = rawPart.trim();

            const tablePk = part.match(/^primary\s+key\s*\(([^)]+)\)/i);
            if (tablePk) {
                splitTopLevel(tablePk[1]).forEach((name) => {
                    pendingPk.add(normalizeIdent(name));
                });
                continue;
            }

            const tableFk = part.match(
                /^foreign\s+key\s*\(([^)]+)\)\s+references\s+([^\s(]+)\s*\(([^)]+)\)/i,
            );
            if (tableFk) {
                const fromCols = splitTopLevel(tableFk[1]).map(normalizeIdent);
                const toTable = normalizeIdent(tableFk[2]);
                const toCols = splitTopLevel(tableFk[3]).map(normalizeIdent);

                fromCols.forEach((fromCol, i) => {
                    const toCol = toCols[i] ?? toCols[0] ?? "id";
                    relations.push({
                        id: `${tableName}.${fromCol}->${toTable}.${toCol}`,
                        fromTable: tableName,
                        fromColumn: fromCol,
                        toTable,
                        toColumn: toCol,
                        fromCardinality: "many",
                        toCardinality: "1",
                        label: fromCol,
                    });
                });
                continue;
            }

            const columnMatch = part.match(/^("[^"]+"|`[^`]+`|\[[^\]]+\]|\w+)\s+([\s\S]+)$/);
            if (!columnMatch) continue;

            const colName = normalizeIdent(columnMatch[1]);
            const rest = columnMatch[2].trim();
            const type = parseType(rest);
            const isPk = /\bprimary\s+key\b/i.test(rest);
            const nullable = !/\bnot\s+null\b/i.test(rest);
            const isUnique = /\bunique\b/i.test(rest);

            const refMatch = rest.match(/\breferences\s+([^\s(]+)\s*\(([^)]+)\)/i);
            const references = refMatch
                ? {
                    table: normalizeIdent(refMatch[1]),
                    column: normalizeIdent(refMatch[2]),
                }
                : undefined;

            const column: ColumnModel = {
                name: colName,
                type,
                nullable,
                isPk,
                isFk: !!references,
                isUnique,
                references,
            };

            table.columns.push(column);

            if (references) {
                relations.push({
                    id: `${tableName}.${colName}->${references.table}.${references.column}`,
                    fromTable: tableName,
                    fromColumn: colName,
                    toTable: references.table,
                    toColumn: references.column,
                    fromCardinality: isUnique
                        ? nullable
                            ? "0..1"
                            : "1"
                        : nullable
                            ? "0..many"
                            : "many",
                    toCardinality: "1",
                    label: colName,
                });
            }
        }

        table.columns = table.columns.map((col) =>
            pendingPk.has(col.name) ? { ...col, isPk: true } : col,
        );

        tableMap.set(tableName, table);
    }

    for (const rel of relations) {
        const source = tableMap.get(rel.fromTable);
        if (!source) continue;

        source.columns = source.columns.map((col) =>
            col.name === rel.fromColumn ? { ...col, isFk: true } : col,
        );
    }

    return {
        tables: Array.from(tableMap.values()),
        relations: relations.filter(
            (rel, index, arr) =>
                tableMap.has(rel.fromTable) &&
                tableMap.has(rel.toTable) &&
                arr.findIndex((x) => x.id === rel.id) === index,
        ),
    };
}

function buildTableLayout(tables: TableModel[]) {
    const cardW = 290;
    const rowH = 26;
    const headerH = 44;
    const gapX = 40;
    const gapY = 48;
    const cols = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, tables.length))));

    const boxes: Box[] = tables.map((table, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const h = headerH + Math.max(1, table.columns.length) * rowH + 20;

        return {
            id: table.id,
            x: 24 + col * (cardW + gapX),
            y: 24 + row * (260 + gapY),
            w: cardW,
            h,
        };
    });

    const width =
        boxes.length > 0
            ? Math.max(...boxes.map((b) => b.x + b.w)) + 24
            : 640;
    const height =
        boxes.length > 0
            ? Math.max(...boxes.map((b) => b.y + b.h)) + 24
            : 420;

    return { boxes, width, height };
}

function sideOf(box: Box, side: "left" | "right" | "top" | "bottom") {
    if (side === "left") {
        return { x: box.x, y: box.y + box.h / 2, dx: -1, dy: 0 };
    }
    if (side === "right") {
        return { x: box.x + box.w, y: box.y + box.h / 2, dx: 1, dy: 0 };
    }
    if (side === "top") {
        return { x: box.x + box.w / 2, y: box.y, dx: 0, dy: -1 };
    }
    return { x: box.x + box.w / 2, y: box.y + box.h, dx: 0, dy: 1 };
}

function pickSides(a: Box, b: Box) {
    const acx = a.x + a.w / 2;
    const acy = a.y + a.h / 2;
    const bcx = b.x + b.w / 2;
    const bcy = b.y + b.h / 2;
    const dx = bcx - acx;
    const dy = bcy - acy;

    if (Math.abs(dx) >= Math.abs(dy)) {
        return dx >= 0
            ? { aSide: "right" as const, bSide: "left" as const }
            : { aSide: "left" as const, bSide: "right" as const };
    }

    return dy >= 0
        ? { aSide: "bottom" as const, bSide: "top" as const }
        : { aSide: "top" as const, bSide: "bottom" as const };
}

function orthogonalPath(
    start: { x: number; y: number },
    end: { x: number; y: number },
    horizontalFirst: boolean,
) {
    if (horizontalFirst) {
        const mx = (start.x + end.x) / 2;
        return `M ${start.x} ${start.y} L ${mx} ${start.y} L ${mx} ${end.y} L ${end.x} ${end.y}`;
    }

    const my = (start.y + end.y) / 2;
    return `M ${start.x} ${start.y} L ${start.x} ${my} L ${end.x} ${my} L ${end.x} ${end.y}`;
}

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

    const line = (x1: number, y1: number, x2: number, y2: number, key: string) => (
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

function ResultsTab(props: { result: Extract<SqlRunResult, { ok: true }> }) {
    const { result } = props;
    const columns = result.columns ?? [];
    const rows = result.rows ?? [];
    const hasGrid = columns.length > 0;

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <Badge tone="good">{result.status}</Badge>
                <Badge>{result.dialect}</Badge>

                {typeof result.rowCount === "number" ? (
                    <Badge>{result.rowCount} row{result.rowCount === 1 ? "" : "s"}</Badge>
                ) : null}

                {typeof result.affectedRows === "number" ? (
                    <Badge>{result.affectedRows} affected</Badge>
                ) : null}

                {result.time ? <Badge>{result.time}s</Badge> : null}
            </div>

            {result.notices?.length ? (
                <div className="rounded-2xl border border-amber-300/30 bg-amber-50/70 p-3 dark:border-amber-300/20 dark:bg-amber-950/20">
                    <div className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-amber-800 dark:text-amber-200">
                        Notices
                    </div>
                    <div className="space-y-1">
                        {result.notices.map((n, i) => (
                            <div
                                key={i}
                                className="text-xs font-semibold text-amber-800 dark:text-amber-200"
                            >
                                {n}
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            {hasGrid ? (
                <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-neutral-200/70 bg-white/85 dark:border-white/10 dark:bg-black/20">
                    <div className="h-full overflow-auto">
                        <table className="min-w-full border-collapse">
                            <thead className="sticky top-0 z-10 bg-neutral-100/95 backdrop-blur dark:bg-neutral-900/95">
                            <tr>
                                {columns.map((col, i) => (
                                    <th
                                        key={`${col.name}-${i}`}
                                        className="border-b border-neutral-200 px-3 py-2 text-left text-[11px] font-black uppercase tracking-[0.12em] text-neutral-600 dark:border-white/10 dark:text-white/55"
                                    >
                                        <div className="flex min-w-[120px] items-center gap-2">
                                            <span className="truncate">{col.name}</span>
                                            {col.type ? (
                                                <span className="rounded-md border border-neutral-200 bg-white px-1.5 py-0.5 text-[10px] font-bold normal-case tracking-normal text-neutral-500 dark:border-white/10 dark:bg-white/[0.06] dark:text-white/40">
                                                        {col.type}
                                                    </span>
                                            ) : null}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                            </thead>

                            <tbody>
                            {rows.length ? (
                                rows.map((row, ri) => (
                                    <tr
                                        key={ri}
                                        className={cn(
                                            "border-b border-neutral-200/70 last:border-b-0 dark:border-white/10",
                                            ri % 2 === 0
                                                ? "bg-white/70 dark:bg-transparent"
                                                : "bg-neutral-50/70 dark:bg-white/[0.02]",
                                        )}
                                    >
                                        {columns.map((_, ci) => (
                                            <td
                                                key={`${ri}-${ci}`}
                                                className="max-w-[420px] px-3 py-2 align-top text-xs font-medium text-neutral-800 dark:text-white/85"
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
                                        colSpan={Math.max(1, columns.length)}
                                        className="px-4 py-8 text-center text-sm font-semibold text-neutral-500 dark:text-white/45"
                                    >
                                        Query returned no rows.
                                    </td>
                                </tr>
                            )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="rounded-2xl border border-neutral-200/70 bg-white/85 p-4 dark:border-white/10 dark:bg-black/20">
                    <div className="text-[11px] font-black uppercase tracking-[0.14em] text-neutral-500 dark:text-white/45">
                        Output
                    </div>
                    <div className="mt-2 whitespace-pre-wrap break-words text-sm font-semibold text-neutral-800 dark:text-white/85">
                        {result.stdout ?? "Statement completed."}
                    </div>
                </div>
            )}
        </div>
    );
}

function EmptySchemaState(props: { title: string; subtitle: string }) {
    return (
        <div className="flex h-full min-h-0 items-center justify-center rounded-2xl border border-dashed border-neutral-200/70 bg-white/80 p-6 dark:border-white/10 dark:bg-black/20">
            <div className="text-center">
                <div className="text-sm font-black text-neutral-900 dark:text-white/90">
                    {props.title}
                </div>
                <div className="mt-1 text-xs font-semibold text-neutral-500 dark:text-white/50">
                    {props.subtitle}
                </div>
            </div>
        </div>
    );
}

function TablesTab(props: {
    schema: SchemaModel;
    positions: DiagramPositions;
    onMove: (tab: DiagramTabKey, id: string, x: number, y: number) => void;
}) {
    const { schema, positions, onMove } = props;

    const initialLayout = React.useMemo(() => buildTableLayout(schema.tables), [schema.tables]);

    const rawBoxes = React.useMemo(
        () => clampDiagramBoxes("tables", applyStoredPositions("tables", initialLayout.boxes, positions)),
        [initialLayout, positions],
    );

    const scene = React.useMemo(
        () => buildDiagramScene(rawBoxes, "tables"),
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
                title="No schema available"
                subtitle="Pass schema.sql into the SQL runner to render tables and relationships."
            />
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <Badge>{schema.tables.length} table{schema.tables.length === 1 ? "" : "s"}</Badge>
                <Badge>{schema.relations.length} relation{schema.relations.length === 1 ? "" : "s"}</Badge>
            </div>

            <div className="min-h-0 flex-1">
                <PanZoomCanvas width={scene.width} height={scene.height} fitKey={fitKey}>
                    {({ scale }) => (
                        <div className="relative h-full w-full">
                            {schema.tables.map((table) => {
                                const box = boxById.get(table.id)!;

                                const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
                                    e.preventDefault();
                                    e.stopPropagation();

                                    const startClientX = e.clientX;
                                    const startClientY = e.clientY;
                                    const startX = box.x;
                                    const startY = box.y;

                                    const move = (ev: PointerEvent) => {
                                        const dx = (ev.clientX - startClientX) / scale;
                                        const dy = (ev.clientY - startClientY) / scale;
                                        const next = clampDiagramNodePosition(
                                            "tables",
                                            startX + dx,
                                            startY + dy,
                                        );
                                        onMove("tables", box.id, next.x, next.y);
                                    };

                                    const up = () => {
                                        window.removeEventListener("pointermove", move);
                                        window.removeEventListener("pointerup", up);
                                    };

                                    window.addEventListener("pointermove", move);
                                    window.addEventListener("pointerup", up);
                                };

                                return (
                                    <div
                                        key={table.id}
                                        className="absolute overflow-hidden rounded-2xl border border-neutral-200/70 bg-white/90 shadow-sm dark:border-white/10 dark:bg-neutral-950/95"
                                        style={{
                                            left: box.x,
                                            top: box.y,
                                            width: box.w,
                                            minHeight: box.h,
                                        }}
                                    >
                                        <div
                                            onPointerDown={onPointerDown}
                                            className="cursor-grab border-b border-neutral-200/70 bg-neutral-100/85 px-4 py-3 active:cursor-grabbing dark:border-white/10 dark:bg-white/[0.05]"
                                        >
                                            <div className="text-sm font-black text-neutral-900 dark:text-white/90">
                                                {table.name}
                                            </div>
                                            <div className="mt-1 text-[11px] font-semibold text-neutral-500 dark:text-white/45">
                                                {table.columns.length} column{table.columns.length === 1 ? "" : "s"}
                                            </div>
                                        </div>

                                        <div className="divide-y divide-neutral-200/70 dark:divide-white/10">
                                            {table.columns.map((col) => (
                                                <div
                                                    key={col.name}
                                                    className="flex items-start justify-between gap-3 px-4 py-3"
                                                >
                                                    <div className="min-w-0">
                                                        <div className="truncate text-sm font-bold text-neutral-900 dark:text-white/90">
                                                            {col.name}
                                                        </div>
                                                        <div className="mt-1 text-xs font-semibold text-neutral-500 dark:text-white/45">
                                                            {col.type || "type unknown"}
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-wrap justify-end gap-1">
                                                        {col.isPk ? <Badge tone="good">PK</Badge> : null}
                                                        {col.isFk ? <Badge tone="warn">FK</Badge> : null}
                                                        {col.isUnique ? <Badge>UNIQUE</Badge> : null}
                                                        {!col.nullable ? <Badge>NOT NULL</Badge> : null}
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

function ErdTab(props: {
    schema: SchemaModel;
    positions: DiagramPositions;
    onMove: (tab: DiagramTabKey, id: string, x: number, y: number) => void;
}) {
    const { schema, positions, onMove } = props;

    const initialLayout = React.useMemo(() => buildTableLayout(schema.tables), [schema.tables]);

    const rawBoxes = React.useMemo(
        () => clampDiagramBoxes("erd", applyStoredPositions("erd", initialLayout.boxes, positions)),
        [initialLayout, positions],
    );

    const scene = React.useMemo(
        () => buildDiagramScene(rawBoxes, "erd"),
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
                <Badge>{schema.tables.length} entity table{schema.tables.length === 1 ? "" : "s"}</Badge>
                <Badge tone="warn">{schema.relations.length} crow’s-foot relation{schema.relations.length === 1 ? "" : "s"}</Badge>
            </div>

            <div className="min-h-0 flex-1">
                <PanZoomCanvas width={scene.width} height={scene.height} fitKey={fitKey}>
                    {({ scale }) => (
                        <div className="relative h-full w-full">
                            <svg
                                width={scene.width}
                                height={scene.height}
                                className="absolute inset-0 z-0"
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
                                const box = boxById.get(table.id)!;

                                const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
                                    e.preventDefault();
                                    e.stopPropagation();

                                    const startClientX = e.clientX;
                                    const startClientY = e.clientY;
                                    const startX = box.x;
                                    const startY = box.y;

                                    const move = (ev: PointerEvent) => {
                                        const dx = (ev.clientX - startClientX) / scale;
                                        const dy = (ev.clientY - startClientY) / scale;
                                        const next = clampDiagramNodePosition(
                                            "erd",
                                            startX + dx,
                                            startY + dy,
                                        );
                                        onMove("erd", box.id, next.x, next.y);
                                    };

                                    const up = () => {
                                        window.removeEventListener("pointermove", move);
                                        window.removeEventListener("pointerup", up);
                                    };

                                    window.addEventListener("pointermove", move);
                                    window.addEventListener("pointerup", up);
                                };

                                return (
                                    <div
                                        key={table.id}
                                        className="absolute z-10 overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-neutral-950"
                                        style={{
                                            left: box.x,
                                            top: box.y,
                                            width: box.w,
                                            height: box.h,
                                        }}
                                    >
                                        <div
                                            onPointerDown={onPointerDown}
                                            className="cursor-grab border-b border-neutral-200/70 bg-neutral-100/90 px-4 py-3 active:cursor-grabbing dark:border-white/10 dark:bg-white/[0.05]"
                                        >
                                            <div className="truncate text-sm font-black text-neutral-900 dark:text-white/90">
                                                {table.name}
                                            </div>
                                        </div>

                                        <div className="divide-y divide-neutral-200/70 dark:divide-white/10">
                                            {table.columns.map((col) => (
                                                <div
                                                    key={col.name}
                                                    className="flex items-center justify-between gap-2 px-4 py-1.5 text-xs"
                                                >
                                                    <div className="min-w-0 truncate font-semibold text-neutral-800 dark:text-white/85">
                                                        {col.name}
                                                    </div>

                                                    <div className="flex items-center gap-1">
                                                        {col.isPk ? (
                                                            <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-black text-emerald-700 dark:text-emerald-200">
                                                                PK
                                                            </span>
                                                        ) : null}
                                                        {col.isFk ? (
                                                            <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-black text-amber-700 dark:text-amber-200">
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

function ChenTab(props: {
    schema: SchemaModel;
    positions: DiagramPositions;
    onMove: (tab: DiagramTabKey, id: string, x: number, y: number) => void;
}) {
    const { schema, positions, onMove } = props;

    const initialLayout = React.useMemo(() => buildChenLayout(schema.tables), [schema.tables]);

    const rawBoxes = React.useMemo(
        () => clampDiagramBoxes("chen", applyStoredPositions("chen", initialLayout.boxes, positions)),
        [initialLayout, positions],
    );

    const scene = React.useMemo(
        () => buildDiagramScene(rawBoxes, "chen"),
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
                <PanZoomCanvas width={scene.width} height={scene.height} fitKey={fitKey}>
                    {({ scale }) => (
                        <svg
                            width={scene.width}
                            height={scene.height}
                            viewBox={`0 0 ${scene.width} ${scene.height}`}
                            className="block"
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
                                const attrs = entity.table.columns.slice(0, 10);
                                const hiddenCount = Math.max(0, entity.table.columns.length - attrs.length);

                                const onPointerDown = (e: React.PointerEvent<SVGGElement>) => {
                                    e.preventDefault();
                                    e.stopPropagation();

                                    const startClientX = e.clientX;
                                    const startClientY = e.clientY;
                                    const startX = entity.x;
                                    const startY = entity.y;

                                    const move = (ev: PointerEvent) => {
                                        const dx = (ev.clientX - startClientX) / scale;
                                        const dy = (ev.clientY - startClientY) / scale;
                                        const next = clampDiagramNodePosition(
                                            "chen",
                                            startX + dx,
                                            startY + dy,
                                        );
                                        onMove("chen", entity.id, next.x, next.y);
                                    };

                                    const up = () => {
                                        window.removeEventListener("pointermove", move);
                                        window.removeEventListener("pointerup", up);
                                    };

                                    window.addEventListener("pointermove", move);
                                    window.addEventListener("pointerup", up);
                                };

                                return (
                                    <g key={entity.id}>
                                        <g onPointerDown={onPointerDown} className="cursor-grab active:cursor-grabbing">
                                            <rect
                                                x={entity.x}
                                                y={entity.y}
                                                width={entity.w}
                                                height={entity.h}
                                                rx={12}
                                                fill="white"
                                                stroke="#cbd5e1"
                                                strokeWidth="1.5"
                                            />
                                            <text
                                                x={entity.x + entity.w / 2}
                                                y={entity.y + 29}
                                                textAnchor="middle"
                                                fontSize="13"
                                                fontWeight="800"
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
                                                        fontWeight={col.isPk ? 800 : 600}
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

export default function SqlResultsPane(props: {
    result: SqlRunResult | null;
    busy: boolean;
    className?: string;
    schemaSql?: string;
}) {
    const { result, busy, className, schemaSql = "" } = props;
    const [tab, setTab] = React.useState<TabKey>("results");
    const [positions, setPositions] = React.useState<DiagramPositions>({});

    React.useEffect(() => {
        if (busy) {
            setTab("results");
        }
    }, [busy]);

    const schema = React.useMemo(() => parseSchemaSql(schemaSql), [schemaSql]);
    const tableLayout = React.useMemo(() => buildTableLayout(schema.tables), [schema.tables]);
    const chenLayout = React.useMemo(() => buildChenLayout(schema.tables), [schema.tables]);

    React.useEffect(() => {
        setPositions((prev) => {
            let next = syncTabDefaults(prev, "tables", tableLayout.boxes);
            next = syncTabDefaults(next, "erd", tableLayout.boxes);
            next = syncTabDefaults(next, "chen", chenLayout.boxes);
            return next;
        });
    }, [tableLayout, chenLayout]);

    const handleMove = React.useCallback(
        (diagramTab: DiagramTabKey, id: string, x: number, y: number) => {
            setPositions((prev) => ({
                ...prev,
                [diagramPosKey(diagramTab, id)]: { x, y },
            }));
        },
        [],
    );

    if (busy) {
        return (
            <div
                className={cn(
                    "flex h-full min-h-0 items-center justify-center rounded-2xl border border-neutral-200/70 bg-white/80 p-6 dark:border-white/10 dark:bg-black/20",
                    className,
                )}
            >
                <div className="text-center">
                    <div className="text-sm font-black text-neutral-900 dark:text-white/90">
                        Running query…
                    </div>
                    <div className="mt-1 text-xs font-semibold text-neutral-500 dark:text-white/50">
                        Executing SQL and preparing result rows
                    </div>
                </div>
            </div>
        );
    }

    if (!result) {
        return (
            <div className={cn("flex h-full min-h-0 flex-col gap-3", className)}>
                <div className="flex flex-wrap items-center gap-2">
                    <TabButton active={tab === "results"} onClick={() => setTab("results")}>
                        Results
                    </TabButton>
                    <TabButton active={tab === "tables"} onClick={() => setTab("tables")}>
                        Tables
                    </TabButton>
                    <TabButton active={tab === "erd"} onClick={() => setTab("erd")}>
                        ERD
                    </TabButton>
                    <TabButton active={tab === "chen"} onClick={() => setTab("chen")}>
                        Chen
                    </TabButton>
                </div>

                <div className="min-h-0 flex-1">
                    {tab === "tables" ? (
                        <TablesTab schema={schema} positions={positions} onMove={handleMove} />
                    ) : tab === "erd" ? (
                        <ErdTab schema={schema} positions={positions} onMove={handleMove} />
                    ) : tab === "chen" ? (
                        <ChenTab schema={schema} positions={positions} onMove={handleMove} />
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

    if (!result.ok) {
        return (
            <div className={cn("flex h-full min-h-0 flex-col gap-3", className)}>
                <div className="flex flex-wrap items-center gap-2">
                    <TabButton active={tab === "results"} onClick={() => setTab("results")}>
                        Results
                    </TabButton>
                    <TabButton active={tab === "tables"} onClick={() => setTab("tables")}>
                        Tables
                    </TabButton>
                    <TabButton active={tab === "erd"} onClick={() => setTab("erd")}>
                        ERD
                    </TabButton>
                    <TabButton active={tab === "chen"} onClick={() => setTab("chen")}>
                        Chen
                    </TabButton>
                </div>

                <div className="min-h-0 flex-1">
                    {tab === "results" ? (
                        <div className="flex h-full min-h-0 flex-col rounded-2xl border border-rose-300/30 bg-rose-50/70 p-4 dark:border-rose-300/20 dark:bg-rose-950/20">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge tone="bad">SQL error</Badge>
                                <Badge>{result.dialect}</Badge>
                                <Badge tone="bad">{result.status}</Badge>
                            </div>

                            <div className="mt-3 rounded-xl border border-rose-300/25 bg-white/70 p-3 dark:border-rose-300/15 dark:bg-black/20">
                                <pre className="whitespace-pre-wrap break-words text-xs font-semibold text-rose-800 dark:text-rose-200">
                                    {result.error ?? result.stderr ?? result.message ?? "Query failed."}
                                </pre>
                            </div>
                        </div>
                    ) : tab === "tables" ? (
                        <TablesTab schema={schema} positions={positions} onMove={handleMove} />
                    ) : tab === "erd" ? (
                        <ErdTab schema={schema} positions={positions} onMove={handleMove} />
                    ) : (
                        <ChenTab schema={schema} positions={positions} onMove={handleMove} />
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className={cn("flex h-full min-h-0 flex-col gap-3", className)}>
            <div className="flex flex-wrap items-center gap-2">
                <TabButton active={tab === "results"} onClick={() => setTab("results")}>
                    Results
                </TabButton>
                <TabButton active={tab === "tables"} onClick={() => setTab("tables")}>
                    Tables
                </TabButton>
                <TabButton active={tab === "erd"} onClick={() => setTab("erd")}>
                    ERD
                </TabButton>
                <TabButton active={tab === "chen"} onClick={() => setTab("chen")}>
                    Chen
                </TabButton>
            </div>

            <div className="min-h-0 flex-1">
                {tab === "results" ? (
                    <ResultsTab result={result} />
                ) : tab === "tables" ? (
                    <TablesTab schema={schema} positions={positions} onMove={handleMove} />
                ) : tab === "erd" ? (
                    <ErdTab schema={schema} positions={positions} onMove={handleMove} />
                ) : (
                    <ChenTab schema={schema} positions={positions} onMove={handleMove} />
                )}
            </div>
        </div>
    );
}