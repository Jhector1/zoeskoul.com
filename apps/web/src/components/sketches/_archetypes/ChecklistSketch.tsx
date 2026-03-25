"use client";

import React, { useMemo } from "react";
import type { SavedSketchState } from "../subjects/types";
import type { ChecklistSpec } from "../subjects/specTypes";
import { cn, SKETCH_SOFT } from "@/components/sketches/_shared/sketchUi";

export default function ChecklistSketch({
                                            spec,
                                            value,
                                            onChange,
                                            readOnly,
                                        }: {
    spec: ChecklistSpec;
    value: SavedSketchState;
    onChange: (s: SavedSketchState) => void;
    readOnly?: boolean;
}) {
    const data = (value.data ?? {}) as any;
    const checked: Record<string, boolean> = data.checked ?? {};

    const doneCount = useMemo(
        () => spec.items.reduce((acc, it) => acc + (checked[it.id] ? 1 : 0), 0),
        [spec.items, checked],
    );

    function toggle(id: string) {
        if (readOnly) return;
        const next = { ...checked, [id]: !checked[id] };
        onChange({ ...value, updatedAt: new Date().toISOString(), data: { ...data, checked: next } });
    }

    return (
        <div className="grid gap-3">
            <div className={SKETCH_SOFT}>
                <div className="text-xs font-extrabold text-neutral-700 dark:text-white/70">
                    Checklist • {doneCount}/{spec.items.length}
                </div>
            </div>

            <div className="grid gap-2">
                {spec.items.map((it) => (
                    <button
                        key={it.id}
                        type="button"
                        onClick={() => toggle(it.id)}
                        disabled={readOnly}
                        className={cn(
                            "w-full text-left rounded-2xl border px-4 py-3 transition",
                            "border-neutral-200 bg-white hover:bg-neutral-50",
                            "dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]",
                            checked[it.id] && "border-emerald-600/25 bg-emerald-500/10 dark:border-emerald-300/30 dark:bg-emerald-300/10",
                            readOnly && "opacity-70 cursor-not-allowed",
                        )}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-sm font-extrabold text-neutral-900 dark:text-white">
                                    {it.label}
                                </div>
                                {it.hint ? (
                                    <div className="mt-1 text-xs text-neutral-600 dark:text-white/60">{it.hint}</div>
                                ) : null}
                            </div>
                            <div className="shrink-0 text-sm font-black">
                                {checked[it.id] ? "✓" : "○"}
                            </div>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
