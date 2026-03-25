"use client";

import React, { useMemo } from "react";
import type { SavedSketchState } from "../subjects/types";
import type { TransformToggleSpec } from "../subjects/specTypes";
import { copyText } from "@/components/sketches/_shared/clipboard";
import {
    CodeBlock,
    cn,
    SKETCH_BTN,
    SKETCH_INPUT,
    SKETCH_LABEL,
    SKETCH_SOFT,
    SKETCH_TEXTAREA,
} from "@/components/sketches/_shared/sketchUi";

function applyTransform(kind: TransformToggleSpec["transforms"][number]["kind"], input: string) {
    const t = input.trim();
    if (!t) return "";

    if (kind === "bullets") return t.split(/\n+/).map((x) => `- ${x.trim()}`).join("\n");
    if (kind === "steps") return t.split(/\n+/).map((x, i) => `${i + 1}) ${x.trim()}`).join("\n");
    if (kind === "shorten") return t.length > 180 ? t.slice(0, 180).trimEnd() + "…" : t;
    if (kind === "expand") return `${t}\n\nAdd: (1) a concrete example, (2) a constraint, (3) the desired format.`;
    if (kind === "summarize") return `Summary:\n- ${t.split(/\n+/).slice(0, 3).join("\n- ")}`;
    if (kind === "table_2col") {
        const lines = t.split(/\n+/).map((x) => x.trim()).filter(Boolean);
        return ["| Item | Notes |", "|---|---|", ...lines.map((x) => `| ${x} |  |`)].join("\n");
    }
    return t;
}

export default function TransformToggleSketch({
                                                  spec,
                                                  value,
                                                  onChange,
                                                  readOnly,
                                              }: {
    spec: TransformToggleSpec;
    value: SavedSketchState;
    onChange: (s: SavedSketchState) => void;
    readOnly?: boolean;
}) {
    const data = (value.data ?? {}) as any;
    const input = String(data.input ?? spec.sampleInput ?? "");
    const enabled: Record<string, boolean> = data.enabled ?? {};

    function setInput(v: string) {
        if (readOnly) return;
        onChange({ ...value, updatedAt: new Date().toISOString(), data: { ...data, input: v } });
    }

    function toggle(id: string) {
        if (readOnly) return;
        onChange({
            ...value,
            updatedAt: new Date().toISOString(),
            data: { ...data, enabled: { ...enabled, [id]: !enabled[id] } },
        });
    }

    const output = useMemo(() => {
        let out = input;
        for (const tr of spec.transforms) {
            if (enabled[tr.id]) out = applyTransform(tr.kind, out);
        }
        return out;
    }, [input, enabled, spec.transforms]);

    return (
        <div className="grid gap-3">
            <div className={SKETCH_SOFT}>
                <div className={SKETCH_LABEL}>{spec.inputLabel ?? "Input"}</div>
                <textarea className={SKETCH_TEXTAREA} value={input} onChange={(e) => setInput(e.target.value)} disabled={readOnly} />
            </div>

            <div className="grid gap-2 md:grid-cols-2">
                {spec.transforms.map((tr) => {
                    const on = Boolean(enabled[tr.id]);
                    return (
                        <button
                            key={tr.id}
                            type="button"
                            onClick={() => toggle(tr.id)}
                            disabled={readOnly}
                            className={cn(
                                "rounded-2xl border px-4 py-3 text-left transition",
                                "border-neutral-200 bg-white hover:bg-neutral-50",
                                "dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]",
                                on && "border-emerald-600/25 bg-emerald-500/10 dark:border-emerald-300/30 dark:bg-emerald-300/10",
                            )}
                        >
                            <div className="text-sm font-extrabold text-neutral-900 dark:text-white">{tr.label}</div>
                            {tr.description ? (
                                <div className="mt-1 text-xs text-neutral-600 dark:text-white/60">{tr.description}</div>
                            ) : null}
                        </button>
                    );
                })}
            </div>

            <CodeBlock
                title="Output"
                actions={<button className={SKETCH_BTN} type="button" onClick={() => void copyText(output)}>Copy</button>}
            >
                {output}
            </CodeBlock>
        </div>
    );
}
