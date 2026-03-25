"use client";

import React, { useMemo } from "react";
import MathMarkdown from "@/components/markdown/MathMarkdown";
import type { SavedSketchState } from "../subjects/types";
import type { IntroStepperSpec } from "../subjects/specTypes";
import { cn, SKETCH_BTN, SKETCH_SOFT } from "@/components/sketches/_shared/sketchUi";

export default function IntroStepperSketch({
                                               spec,
                                               value,
                                               onChange,
                                               readOnly,
                                           }: {
    spec: IntroStepperSpec;
    value: SavedSketchState;
    onChange: (s: SavedSketchState) => void;
    readOnly?: boolean;
}) {
    const data = (value.data ?? {}) as any;
    const step = Number.isFinite(data.step) ? Number(data.step) : 0;
    const steps = spec.steps ?? [];
    const i = Math.max(0, Math.min(steps.length - 1, step));

    function setStep(next: number) {
        onChange({
            ...value,
            updatedAt: new Date().toISOString(),
            data: { ...data, step: next },
        });
    }

    const cur = steps[i];

    const meter = useMemo(() => {
        const pct = steps.length ? Math.round(((i + 1) / steps.length) * 100) : 0;
        return { pct, label: `${i + 1}/${steps.length}` };
    }, [i, steps.length]);

    return (
        <div className="grid gap-3">
            <div className={SKETCH_SOFT}>
                <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-extrabold text-neutral-700 dark:text-white/70">
                        Step {meter.label}
                    </div>
                    <div className="text-[11px] font-black text-neutral-500 dark:text-white/50">{meter.pct}%</div>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-200/70 dark:bg-white/10">
                    <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500/70 via-emerald-500/60 to-teal-400/60 dark:from-emerald-200/30 dark:via-emerald-200/25 dark:to-teal-200/25"
                        style={{ width: `${meter.pct}%` }}
                    />
                </div>
            </div>

            <div className={cn(SKETCH_SOFT, "p-4")}>
                <div className="text-lg font-black text-neutral-900 dark:text-white">{cur?.title ?? "Step"}</div>
                <MathMarkdown className="ui-math mt-3" content={cur?.bodyMarkdown ?? ""} />
            </div>

            <div className="flex items-center justify-between gap-2">
                <button className={SKETCH_BTN} disabled={readOnly || i <= 0} onClick={() => setStep(i - 1)}>
                    ← Back
                </button>

                <button
                    className={SKETCH_BTN}
                    disabled={readOnly || i >= steps.length - 1}
                    onClick={() => setStep(i + 1)}
                >
                    {i >= steps.length - 1 ? (spec.ctaLabel ?? "Done") : "Next →"}
                </button>
            </div>
        </div>
    );
}
