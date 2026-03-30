"use client";

import * as React from "react";
import type { SavedSketchState } from "./types";
import type { SketchSpec } from "./specTypes";
import { useTaggedT, isTaggedKey, stripTag } from "@/i18n/tagged";

import { ParagraphSketch } from "@/components/sketches/_archetypes/ParagraphSketch";
import ImageSketch from "@/components/sketches/_archetypes/ImageSketch";

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
    const { raw } = useTaggedT();

    const specT = React.useMemo(
        () => resolveDeep(spec, (k) => raw(k, "")) as SketchSpec,
        [spec, raw],
    );

    switch (specT.archetype) {
        case "paragraph":
            return <ParagraphSketch spec={specT as any} />;

        case "image":
            return <ImageSketch spec={specT as any} value={value} onChange={onChange} readOnly={readOnly} />;

        default:
            return (
                <div className="ui-surface-danger p-3 text-xs">
                    <div className="ui-title-sm">Unknown archetype</div>
                    <div className="mt-1 ui-meta-strong">
                        <span className="font-mono">{String((specT as any)?.archetype)}</span>
                    </div>
                </div>
            );
    }
}