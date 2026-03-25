"use client";

import * as React from "react";
import type { SavedSketchState } from "./types";
import type { SketchSpec } from "./specTypes";
import { useTaggedT, isTaggedKey, stripTag } from "@/i18n/tagged";

import { ParagraphSketch } from "@/components/sketches/_archetypes/ParagraphSketch";
import ImageSketch from "@/components/sketches/_archetypes/ImageSketch";

// NOTE: tKey should be RAW-safe (no ICU parsing)
function resolveDeep(input: unknown, tKey: (k: string) => string): unknown {
    if (typeof input === "string") {
        if (isTaggedKey(input)) return tKey(stripTag(input));
        return input;
    }
    if (Array.isArray(input)) return input.map((x) => resolveDeep(x, tKey));
    if (input && typeof input === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(input as any)) out[k] = resolveDeep(v, tKey);
        return out;
    }
    return input;
}

export default function SketchRenderer({
                                           spec,
                                           value,
                                           onChange,
                                           readOnly,
                                       }: {
    spec: SketchSpec;
    value: SavedSketchState;
    onChange: (s: SavedSketchState) => void;
    readOnly?: boolean;
}) {
    // ✅ get RAW-safe translator too
    const { raw } = useTaggedT();

    const specT = React.useMemo(
        // ✅ tagged values must use raw() so `{name}` / `{}` in code doesn't crash
        () => resolveDeep(spec, (k) => raw(k, "")) as SketchSpec,
        [spec, raw]
    );

    switch (specT.archetype) {
        case "paragraph":
            return <ParagraphSketch spec={specT as any} />;

        case "image":
            return <ImageSketch spec={specT as any} value={value} onChange={onChange} readOnly={readOnly} />;

        default:
            return (
                <div className="rounded-xl border border-rose-300/20 bg-rose-300/10 p-3 text-xs font-extrabold text-rose-700 dark:text-rose-200/90">
                    Unknown archetype: <span className="font-mono">{String((specT as any)?.archetype)}</span>
                </div>
            );
    }
}