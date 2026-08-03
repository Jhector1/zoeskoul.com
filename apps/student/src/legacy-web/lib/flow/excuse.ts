// src/lib/flow/excuse.ts
import type { QItem } from "@/components/practice/practiceType";

/** Quiz-style map value (supports boolean for back-compat) */
export type ExcuseMeta = { at: number; reason?: string | null };
export type ExcusedValue = boolean | ExcuseMeta;
export type ExcusedById = Record<string, ExcusedValue>;

export function isExcusedId(map: ExcusedById | null | undefined, id: string) {
    return Boolean(map && (map as any)[id]);
}

export function normalizeExcusedById(raw: any): ExcusedById {
    if (!raw || typeof raw !== "object") return {};
    const out: ExcusedById = {};
    for (const [k, v] of Object.entries(raw)) {
        if (v === true) out[k] = true;
        else if (v && typeof v === "object") {
            out[k] = {
                at: typeof (v as any).at === "number" ? (v as any).at : Date.now(),
                reason: typeof (v as any).reason === "string" ? (v as any).reason : null,
            };
        } else if (v) {
            out[k] = true;
        }
    }
    return out;
}

export function excuseId(
    prev: ExcusedById,
    id: string,
    reason?: string | null,
): ExcusedById {
    return { ...prev, [id]: { at: Date.now(), reason: reason ?? null } };
}

export function unexcuseId(prev: ExcusedById, id: string): ExcusedById {
    const next = { ...prev };
    delete next[id];
    return next;
}

/* ------------------------------------------------------------------ */
/* Practice-style (QItem) excusing                                     */
/* ------------------------------------------------------------------ */

export function isExcusedPracticeItem(q: QItem | null | undefined) {
    return Boolean((q as any)?.excused);
}

/**
 * Mark a practice item as finalized so navigation can continue.
 * Pure client-side: does not require server changes.
 */
export function excusePracticeItem(q: QItem, reason?: string | null): QItem {
    const now = Date.now();
    const prevResult: any = (q as any).result;

    return {
        ...(q as any),
        excused: true,
        excusedAt: now,
        excusedReason: reason ?? null,

        // ✅ finalized so "Next" is allowed
        submitted: true,
        revealed: false,

        result: {
            ...(prevResult && typeof prevResult === "object" ? prevResult : {}),
            ok: false,
            finalized: true,
            excused: true,
            excusedReason: reason ?? null,
        },
    } as any;
}