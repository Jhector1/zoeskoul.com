"use client";

import React from "react";
import type { SavedSketchState } from "../subjects/types";
import type { LabRunnerSpec } from "../subjects/specTypes";
import { copyText } from "@/components/sketches/_shared/clipboard";
import { cn, SKETCH_BTN, SKETCH_INPUT, SKETCH_LABEL, SKETCH_SOFT, SKETCH_TEXTAREA } from "@/components/sketches/_shared/sketchUi";

export default function LabRunnerSketch({
                                            spec,
                                            value,
                                            onChange,
                                            readOnly,
                                        }: {
    spec: LabRunnerSpec;
    value: SavedSketchState;
    onChange: (s: SavedSketchState) => void;
    readOnly?: boolean;
}) {
    const data = (value.data ?? {}) as any;
    const checked: Record<string, boolean> = data.checked ?? {};
    const submission = String(data.submission ?? "");

    function toggle(id: string) {
        if (readOnly) return;
        onChange({ ...value, updatedAt: new Date().toISOString(), data: { ...data, checked: { ...checked, [id]: !checked[id] } } });
    }

    function setSubmission(v: string) {
        if (readOnly) return;
        onChange({ ...value, updatedAt: new Date().toISOString(), data: { ...data, submission: v } });
    }

    return (
        <div className="grid gap-3">
            <div className={SKETCH_SOFT}>
                <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-black text-neutral-900 dark:text-white">
                        {spec.promptTitle ?? "Copy this prompt"}
                    </div>
                    <button className={SKETCH_BTN} type="button" onClick={() => void copyText(spec.promptText)}>
                        Copy
                    </button>
                </div>

                <pre className="mt-2 whitespace-pre-wrap break-words rounded-xl border border-neutral-200 bg-white p-3 text-[12px] leading-5 text-neutral-800 dark:border-white/10 dark:bg-black/20 dark:text-white/80">
          {spec.promptText}
        </pre>
            </div>

            {spec.checklist?.length ? (
                <div className="grid gap-2">
                    <div className={SKETCH_LABEL}>Checklist</div>
                    {spec.checklist.map((it) => (
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
                            )}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <div className="text-sm font-extrabold text-neutral-900 dark:text-white">{it.label}</div>
                                <div className="text-sm font-black">{checked[it.id] ? "✓" : "○"}</div>
                            </div>
                        </button>
                    ))}
                </div>
            ) : null}

            <div className={SKETCH_SOFT}>
                <div className="text-sm font-black text-neutral-900 dark:text-white">
                    {spec.submitTitle ?? "Paste your result"}
                </div>
                <textarea
                    className={cn(SKETCH_TEXTAREA, "mt-2")}
                    placeholder={spec.submitPlaceholder ?? "Paste your ChatGPT answer here…"}
                    value={submission}
                    onChange={(e) => setSubmission(e.target.value)}
                    disabled={readOnly}
                />
            </div>
        </div>
    );
}
