"use client";

import React, { useMemo } from "react";
import type { SavedSketchState } from "../subjects/types";
import type { PipelineBuilderSpec } from "../subjects/specTypes";
import { cn, SKETCH_SOFT } from "@/components/sketches/_shared/sketchUi";

function move<T>(arr: T[], from: number, to: number) {
    const a = [...arr];
    const [x] = a.splice(from, 1);
    a.splice(to, 0, x);
    return a;
}

export default function PipelineBuilderSketch({
                                                  spec,
                                                  value,
                                                  onChange,
                                                  readOnly,
                                              }: {
    spec: PipelineBuilderSpec;
    value: SavedSketchState;
    onChange: (s: SavedSketchState) => void;
    readOnly?: boolean;
}) {
    const data = (value.data ?? {}) as any;
    const order: string[] = Array.isArray(data.order) ? data.order : spec.steps.map((s) => s.id);

    const steps = useMemo(() => {
        const map = new Map(spec.steps.map((s) => [s.id, s]));
        return order.map((id) => map.get(id)).filter(Boolean) as typeof spec.steps;
    }, [order, spec.steps]);

    function setOrder(next: string[]) {
        if (readOnly) return;
        onChange({ ...value, updatedAt: new Date().toISOString(), data: { ...data, order: next } });
    }

    return (
        <div className="grid gap-3">
            {spec.help ? (
                <div className={SKETCH_SOFT}>
                    <div className="text-xs font-extrabold text-neutral-700 dark:text-white/70">{spec.help}</div>
                </div>
            ) : null}

            <div className="grid gap-2">
                {steps.map((s, idx) => (
                    <div
                        key={s.id}
                        draggable={!readOnly}
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", String(idx))}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                            e.preventDefault();
                            if (readOnly) return;
                            const from = Number(e.dataTransfer.getData("text/plain"));
                            if (!Number.isFinite(from)) return;
                            setOrder(move(order, from, idx));
                        }}
                        className={cn(
                            "rounded-2xl border px-4 py-3",
                            "border-neutral-200 bg-white",
                            "dark:border-white/10 dark:bg-white/[0.04]",
                            !readOnly && "cursor-move",
                        )}
                    >
                        <div className="text-sm font-extrabold text-neutral-900 dark:text-white">{idx + 1}. {s.label}</div>
                        {s.body ? <div className="mt-1 text-xs text-neutral-600 dark:text-white/60">{s.body}</div> : null}
                    </div>
                ))}
            </div>
        </div>
    );
}
