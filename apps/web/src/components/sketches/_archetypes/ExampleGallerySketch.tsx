"use client";

import React, { useMemo } from "react";
import MathMarkdown from "@/components/markdown/MathMarkdown";
import type { SavedSketchState } from "../subjects/types";
import type { ExampleGallerySpec } from "../subjects/specTypes";
import { cn, SKETCH_SOFT } from "@/components/sketches/_shared/sketchUi";

export default function ExampleGallerySketch({
                                                 spec,
                                                 value,
                                                 onChange,
                                                 readOnly,
                                             }: {
    spec: ExampleGallerySpec;
    value: SavedSketchState;
    onChange: (s: SavedSketchState) => void;
    readOnly?: boolean;
}) {
    const data = (value.data ?? {}) as any;
    const selectedId = String(data.selectedId ?? spec.examples[0]?.id ?? "");
    const ex = useMemo(() => spec.examples.find((x) => x.id === selectedId) ?? spec.examples[0], [spec.examples, selectedId]);

    function select(id: string) {
        if (readOnly) return;
        onChange({ ...value, updatedAt: new Date().toISOString(), data: { ...data, selectedId: id } });
    }

    return (
        <div className="grid gap-3 md:grid-cols-[240px_1fr]">
            <div className={SKETCH_SOFT}>
                <div className="text-xs font-extrabold text-neutral-700 dark:text-white/70">Examples</div>
                <div className="mt-2 grid gap-2">
                    {spec.examples.map((x) => (
                        <button
                            key={x.id}
                            type="button"
                            onClick={() => select(x.id)}
                            disabled={readOnly}
                            className={cn(
                                "w-full text-left rounded-xl border px-3 py-2 text-xs font-extrabold transition",
                                "border-neutral-200 bg-white hover:bg-neutral-50",
                                "dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]",
                                x.id === selectedId && "border-emerald-600/25 bg-emerald-500/10 dark:border-emerald-300/30 dark:bg-emerald-300/10",
                            )}
                        >
                            {x.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className={SKETCH_SOFT}>
                <div className="text-lg font-black text-neutral-900 dark:text-white">{ex?.label}</div>
                <MathMarkdown className="ui-math mt-3" content={ex?.bodyMarkdown ?? ""} />
                {ex?.notesMarkdown ? (
                    <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.04]">
                        <MathMarkdown className="ui-math" content={ex.notesMarkdown} />
                    </div>
                ) : null}
            </div>
        </div>
    );
}
