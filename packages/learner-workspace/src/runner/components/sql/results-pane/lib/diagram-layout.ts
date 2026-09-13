
import {TABLE_CARD_H, TABLE_CARD_MIN_W, TABLE_ROWS_PANEL_H} from "../SqlResultsPane.constants";
import type {
    Box,
    DiagramPositions,
    DiagramTabKey,
    TableModel,
} from "../SqlResultsPane.types";
import type { TablePreviewMetrics } from "./snapshots";

export function diagramPosKey(tab: DiagramTabKey, id: string) {
    return `${tab}:${id}`;
}

export function buildChenLayout(tables: TableModel[]) {
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

export function buildTableLayout(
    tables: TableModel[],
    opts?: { includeRowsPanel?: boolean },
) {
    const cardW = 320;
    const rowH = 26;
    const headerH = 40;
    const gapX = 40;
    const gapY = 48;
    const cols = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, tables.length))));
    const rowsPanelH = opts?.includeRowsPanel ? TABLE_ROWS_PANEL_H : 0;

    const laneH = Math.max(248, headerH + 8 * rowH + 16 + rowsPanelH);

    const boxes: Box[] = tables.map((table, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const h =
            headerH + Math.max(1, table.columns.length) * rowH + 16 + rowsPanelH;

        return {
            id: table.id,
            x: 24 + col * (cardW + gapX),
            y: 24 + row * (laneH + gapY),
            w: cardW,
            h,
        };
    });

    const width =
        boxes.length > 0 ? Math.max(...boxes.map((b) => b.x + b.w)) + 24 : 640;
    const height =
        boxes.length > 0 ? Math.max(...boxes.map((b) => b.y + b.h)) + 24 : 420;

    return { boxes, width, height };
}

export function applyStoredPositions(
    tab: DiagramTabKey,
    defaults: Box[],
    positions: DiagramPositions,
) {
    return defaults.map((box) => {
        const saved = positions[diagramPosKey(tab, box.id)];
        return saved ? { ...box, x: saved.x, y: saved.y } : box;
    });
}

export function syncTabDefaults(
    prev: DiagramPositions,
    tab: DiagramTabKey,
    defaults: Box[],
): DiagramPositions {
    let changed = false;
    const next = { ...prev };
    const valid = new Set(defaults.map((b) => diagramPosKey(tab, b.id)));

    for (const key of Object.keys(next)) {
        if (key.startsWith(`${tab}:`) && !valid.has(key)) {
            delete next[key];
            changed = true;
        }
    }

    for (const box of defaults) {
        const key = diagramPosKey(tab, box.id);
        if (!next[key]) {
            next[key] = { x: box.x, y: box.y };
            changed = true;
        }
    }

    return changed ? next : prev;
}

export function buildTablesCanvasLayout(
    tables: TableModel[],
    metricsByTable: Map<string, TablePreviewMetrics>,
) {
    const gapX = 40;
    const gapY = 48;
    const pad = 24;
    const perRow = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, tables.length))));

    const boxes: Box[] = [];
    let x = pad;
    let y = pad;
    let rowMaxH = 0;
    let maxRight = pad;

    tables.forEach((table, i) => {
        if (i > 0 && i % perRow === 0) {
            x = pad;
            y += rowMaxH + gapY;
            rowMaxH = 0;
        }

        const metrics = metricsByTable.get(table.id);
        const w = metrics?.cardWidth ?? TABLE_CARD_MIN_W;
        const h = metrics?.cardHeight ?? TABLE_CARD_H;

        boxes.push({
            id: table.id,
            x,
            y,
            w,
            h,
        });

        maxRight = Math.max(maxRight, x + w);
        rowMaxH = Math.max(rowMaxH, h);
        x += w + gapX;
    });

    return {
        boxes,
        width: maxRight + pad,
        height: y + rowMaxH + pad,
    };
}
