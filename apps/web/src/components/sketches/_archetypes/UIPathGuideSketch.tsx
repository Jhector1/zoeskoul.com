"use client";

import React, { useMemo } from "react";
import type { SavedSketchState } from "../subjects/types";
import type { UIPathGuideSpec } from "../subjects/specTypes";
import { cn, SKETCH_SOFT } from "@/components/sketches/_shared/sketchUi";

export default function UIPathGuideSketch({
                                              spec,
                                              value,
                                              onChange,
                                              readOnly,
                                          }: {
    spec: UIPathGuideSpec;
    value: SavedSketchState;
    onChange: (s: SavedSketchState) => void;
    readOnly?: boolean;
}) {
    const data = (value.data ?? {}) as any;
    const checked: Record<string, boolean> = data.checked ?? {};

    const doneCount = useMemo(
        () => spec.steps.reduce((acc, s) => acc + (checked[s.id] ? 1 : 0), 0),
        [spec.steps, checked],
    );

    function toggle(id: string) {
        if (readOnly) return;
        onChange({
            ...value,
            updatedAt: new Date().toISOString(),
            data: { ...data, checked: { ...checked, [id]: !checked[id] } },
        });
    }

    return (
        <div className="grid gap-3">
            <div className={SKETCH_SOFT}>
                <div className="text-lg font-black text-neutral-900 dark:text-white">{spec.goal}</div>
                <div className="mt-1 text-xs text-neutral-600 dark:text-white/60">
                    {doneCount}/{spec.steps.length} steps completed
                </div>
            </div>

            <div className="grid gap-2">
                {spec.steps.map((s, idx) => (
                    <button
                        key={s.id}
                        type="button"
                        onClick={() => toggle(s.id)}
                        disabled={readOnly}
                        className={cn(
                            "rounded-2xl border px-4 py-3 text-left transition",
                            "border-neutral-200 bg-white hover:bg-neutral-50",
                            "dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]",
                            checked[s.id] && "border-emerald-600/25 bg-emerald-500/10 dark:border-emerald-300/30 dark:bg-emerald-300/10",
                        )}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-sm font-extrabold text-neutral-900 dark:text-white">
                                    {idx + 1}. {s.label}
                                </div>
                                {s.detail ? (
                                    <div className="mt-1 text-xs text-neutral-600 dark:text-white/60">{s.detail}</div>
                                ) : null}
                            </div>
                            <div className="shrink-0 text-sm font-black">{checked[s.id] ? "✓" : "○"}</div>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
