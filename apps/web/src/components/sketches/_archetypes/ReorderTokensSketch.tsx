"use client";

import React, { useMemo } from "react";
import type { SavedSketchState } from "../subjects/types";
import type { ReorderTokensSpec } from "../subjects/specTypes";
import { cn, SKETCH_BTN, SKETCH_SOFT } from "@/components/sketches/_shared/sketchUi";

function move<T>(arr: T[], from: number, to: number) {
    const a = [...arr];
    const [x] = a.splice(from, 1);
    a.splice(to, 0, x);
    return a;
}

export default function ReorderTokensSketch({
                                                spec,
                                                value,
                                                onChange,
                                                readOnly,
                                            }: {
    spec: ReorderTokensSpec;
    value: SavedSketchState;
    onChange: (s: SavedSketchState) => void;
    readOnly?: boolean;
}) {
    const data = (value.data ?? {}) as any;
    const order: string[] = Array.isArray(data.order) ? data.order : spec.tokens.map((t) => t.id);

    const tokens = useMemo(() => {
        const map = new Map(spec.tokens.map((t) => [t.id, t]));
        return order.map((id) => map.get(id)).filter(Boolean) as Array<{ id: string; label: string }>;
    }, [order, spec.tokens]);

    function setOrder(nextOrder: string[]) {
        if (readOnly) return;
        onChange({ ...value, updatedAt: new Date().toISOString(), data: { ...data, order: nextOrder } });
    }

    return (
        <div className="grid gap-3">
            {spec.help ? (
                <div className={SKETCH_SOFT}>
                    <div className="text-xs font-extrabold text-neutral-700 dark:text-white/70">{spec.help}</div>
                </div>
            ) : null}

            <div className="grid gap-2">
                {tokens.map((t, idx) => (
                    <div
                        key={t.id}
                        draggable={!readOnly}
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", String(idx))}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                            e.preventDefault();
                            if (readOnly) return;
                            const from = Number(e.dataTransfer.getData("text/plain"));
                            if (!Number.isFinite(from)) return;
                            const next = move(order, from, idx);
                            setOrder(next);
                        }}
                        className={cn(
                            "rounded-2xl border px-4 py-3",
                            "border-neutral-200 bg-white",
                            "dark:border-white/10 dark:bg-white/[0.04]",
                            !readOnly && "cursor-move",
                        )}
                    >
                        <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-extrabold text-neutral-900 dark:text-white">{t.label}</div>
                            <div className="text-[11px] font-black text-neutral-500 dark:text-white/50">drag</div>
                        </div>
                    </div>
                ))}
            </div>

            {!readOnly ? (
                <button className={SKETCH_BTN} type="button" onClick={() => setOrder(spec.tokens.map((t) => t.id))}>
                    Reset order
                </button>
            ) : null}
        </div>
    );
}
