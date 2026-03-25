"use client";

import React, { useMemo } from "react";
import MathMarkdown from "@/components/markdown/MathMarkdown";
import type { SavedSketchState } from "../subjects/types";
import type { GlossarySpec } from "../subjects/specTypes";
import { cn, SKETCH_INPUT, SKETCH_LABEL, SKETCH_SOFT } from "@/components/sketches/_shared/sketchUi";

export default function GlossarySketch({
                                           spec,
                                           value,
                                           onChange,
                                           readOnly,
                                       }: {
    spec: GlossarySpec;
    value: SavedSketchState;
    onChange: (s: SavedSketchState) => void;
    readOnly?: boolean;
}) {
    const data = (value.data ?? {}) as any;
    const q = String(data.q ?? "");
    const open: Record<string, boolean> = data.open ?? {};

    function setQ(v: string) {
        if (readOnly) return;
        onChange({ ...value, updatedAt: new Date().toISOString(), data: { ...data, q: v } });
    }

    function toggle(id: string) {
        if (readOnly) return;
        onChange({ ...value, updatedAt: new Date().toISOString(), data: { ...data, open: { ...open, [id]: !open[id] } } });
    }

    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return spec.terms;
        return spec.terms.filter((t) => t.term.toLowerCase().includes(s) || (t.tags ?? []).some((x) => x.toLowerCase().includes(s)));
    }, [q, spec.terms]);

    return (
        <div className="grid gap-3">
            <div className={SKETCH_SOFT}>
                <div className={SKETCH_LABEL}>Search</div>
                <input className={SKETCH_INPUT} value={q} onChange={(e) => setQ(e.target.value)} disabled={readOnly} />
            </div>

            <div className="grid gap-2">
                {filtered.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => toggle(t.id)}
                        disabled={readOnly}
                        className={cn(
                            "rounded-2xl border px-4 py-3 text-left transition",
                            "border-neutral-200 bg-white hover:bg-neutral-50",
                            "dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]",
                        )}
                    >
                        <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-black text-neutral-900 dark:text-white">{t.term}</div>
                            <div className="text-[11px] font-black text-neutral-500 dark:text-white/50">
                                {open[t.id] ? "−" : "+"}
                            </div>
                        </div>
                        {open[t.id] ? (
                            <div className="mt-2">
                                <MathMarkdown className="ui-math" content={t.definitionMarkdown} />
                                {(t.tags?.length ?? 0) ? (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        {t.tags!.map((x) => (
                                            <span key={x} className="rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[11px] font-black text-neutral-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/60">
                        {x}
                      </span>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                    </button>
                ))}
            </div>
        </div>
    );
}
