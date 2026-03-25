"use client";

import React, { useMemo } from "react";
import type { SavedSketchState } from "../subjects/types";
import type { ClassifierGateSpec } from "../subjects/specTypes";
import { cn, SKETCH_SOFT } from "@/components/sketches/_shared/sketchUi";
import { toneCls } from "@/components/sketches/_shared/tones";

export default function ClassifierGateSketch({
                                                 spec,
                                                 value,
                                                 onChange,
                                                 readOnly,
                                             }: {
    spec: ClassifierGateSpec;
    value: SavedSketchState;
    onChange: (s: SavedSketchState) => void;
    readOnly?: boolean;
}) {
    const data = (value.data ?? {}) as any;
    const placed: Record<string, string> = data.placed ?? {};

    const stats = useMemo(() => {
        let correct = 0;
        for (const it of spec.items) {
            if (placed[it.id] === it.correctBinId) correct++;
        }
        return { correct, total: spec.items.length };
    }, [placed, spec.items]);

    function place(itemId: string, binId: string) {
        if (readOnly) return;
        onChange({ ...value, updatedAt: new Date().toISOString(), data: { ...data, placed: { ...placed, [itemId]: binId } } });
    }

    return (
        <div className="grid gap-3">
            <div className={SKETCH_SOFT}>
                <div className="text-sm font-black text-neutral-900 dark:text-white">{spec.prompt}</div>
                <div className="mt-1 text-xs text-neutral-600 dark:text-white/60">
                    Correct: {stats.correct}/{stats.total}
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
                {spec.bins.map((b) => (
                    <div key={b.id} className={cn("rounded-2xl border p-3", toneCls(b.tone))}>
                        <div className="text-xs font-extrabold text-neutral-900 dark:text-white">{b.label}</div>
                        <div className="mt-2 grid gap-2">
                            {spec.items
                                .filter((it) => placed[it.id] === b.id)
                                .map((it) => {
                                    const ok = placed[it.id] === it.correctBinId;
                                    return (
                                        <div
                                            key={it.id}
                                            className={cn(
                                                "rounded-xl border px-3 py-2 text-xs font-extrabold",
                                                ok
                                                    ? "border-emerald-600/25 bg-emerald-500/10 dark:border-emerald-300/30 dark:bg-emerald-300/10"
                                                    : "border-neutral-200 bg-white dark:border-white/10 dark:bg-white/[0.04]",
                                            )}
                                        >
                                            {it.label}
                                            {it.explain ? (
                                                <div className="mt-1 text-[11px] font-semibold text-neutral-600 dark:text-white/60">
                                                    {ok ? "✓" : "…"} {it.explain}
                                                </div>
                                            ) : null}
                                        </div>
                                    );
                                })}
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid gap-2">
                <div className="text-xs font-extrabold text-neutral-600 dark:text-white/60">Items to classify</div>
                {spec.items.map((it) => (
                    <div key={it.id} className="rounded-2xl border border-neutral-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.04]">
                        <div className="text-sm font-extrabold text-neutral-900 dark:text-white">{it.label}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {spec.bins.map((b) => (
                                <button
                                    key={b.id}
                                    type="button"
                                    disabled={readOnly}
                                    onClick={() => place(it.id, b.id)}
                                    className={cn(
                                        "rounded-xl border px-3 py-1 text-[11px] font-black transition",
                                        "border-neutral-200 bg-white hover:bg-neutral-50",
                                        "dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]",
                                        placed[it.id] === b.id && "border-emerald-600/25 bg-emerald-500/10 dark:border-emerald-300/30 dark:bg-emerald-300/10",
                                    )}
                                >
                                    {b.label}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
