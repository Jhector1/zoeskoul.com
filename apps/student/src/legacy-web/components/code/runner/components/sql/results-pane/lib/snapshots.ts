
import type { SqlRunResult } from "@/lib/code/types";
import {
    TABLE_CARD_H,
    TABLE_CARD_MAX_W,
    TABLE_CARD_MIN_W,
    TABLE_COL_MAX_W,
    TABLE_COL_MIN_W,
    TABLE_PREVIEW_ROW_LIMIT,
} from "../SqlResultsPane.constants";
import type {
    SchemaModel,
    SqlTableSnapshot,
    SqlTableSnapshots,
    TableModel,
} from "../SqlResultsPane.types";
import { normalizeIdent } from "./schema";

export function getTableSnapshots(result: SqlRunResult | null): SqlTableSnapshots {
    const raw = (result as any)?.ok ? (result as any)?.tableSnapshots : null;

    if (!raw || typeof raw !== "object") return {};
    return raw as SqlTableSnapshots;
}

export function getSnapshotForTable(
    snapshots: SqlTableSnapshots,
    tableName: string,
): SqlTableSnapshot | null {
    if (snapshots[tableName]) return snapshots[tableName];

    const normalized = normalizeIdent(tableName).toLowerCase();

    for (const snapshot of Object.values(snapshots)) {
        if (normalizeIdent(snapshot.name).toLowerCase() === normalized) {
            return snapshot;
        }
    }

    return null;
}

function clampPx(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function cellText(value: unknown) {
    if (value == null) return "NULL";
    if (typeof value === "boolean") return value ? "true" : "false";
    return String(value);
}

function estimateTextWidthPx(value: unknown) {
    const text = String(value ?? "");
    return clampPx(text.length * 7 + 24, 40, 360);
}

export type TablePreviewMetrics = {
    columns: Array<{
        name: string;
        type?: string | null;
        width: number;
    }>;
    tableMinWidth: number;
    cardWidth: number;
    cardHeight: number;
};


// export type TablePreviewMetrics = {
//     columns: Array<{
//         name: string;
//         type?: string | null;
//         width: number;
//     }>;
//     tableMinWidth: number;
//     cardWidth: number;
//     cardHeight: number;
// };

export function buildTablePreviewMetrics(
    table: TableModel,
    snapshots: SqlTableSnapshots,
): TablePreviewMetrics {
    const snapshot = getSnapshotForTable(snapshots, table.name);

    const displayColumns =
        snapshot?.columns?.length
            ? snapshot.columns
            : table.columns.map((col) => ({
                name: col.name,
                type: col.type ?? null,
            }));

    const previewRows = (snapshot?.rows ?? []).slice(0, TABLE_PREVIEW_ROW_LIMIT);

    const columns = displayColumns.map((col, ci) => {
        const headerWidth = estimateTextWidthPx(col.name);
        const typeWidth = col.type ? estimateTextWidthPx(col.type) : 0;

        const sampleValueWidth = previewRows.reduce((max, row) => {
            return Math.max(max, estimateTextWidthPx(cellText(row[ci])));
        }, 0);

        const width = clampPx(
            Math.max(headerWidth, typeWidth, sampleValueWidth) + 20,
            TABLE_COL_MIN_W,
            TABLE_COL_MAX_W,
        );

        return {
            name: col.name,
            type: col.type ?? null,
            width,
        };
    });

    const tableMinWidth = columns.reduce((sum, col) => sum + col.width, 0);
    const cardWidth = clampPx(tableMinWidth + 2, TABLE_CARD_MIN_W, TABLE_CARD_MAX_W);

    return {
        columns,
        tableMinWidth,
        cardWidth,
        cardHeight: TABLE_CARD_H,
    };
}

export function buildDefaultTableSnapshots(schema: SchemaModel): SqlTableSnapshots {
    const out: SqlTableSnapshots = {};

    for (const table of schema.tables) {
        out[table.name] = {
            name: table.name,
            columns: table.columns.map((col) => ({
                name: col.name,
                type: col.type ?? null,
            })),
            rows: [],
            rowCount: 0,
        };
    }

    return out;
}

