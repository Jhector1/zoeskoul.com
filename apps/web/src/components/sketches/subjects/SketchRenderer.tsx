"use client";

import * as React from "react";
import { useMessages } from "next-intl";
import { resolveDeepTagged } from "@/i18n/resolveDeepTagged";
import type { SavedSketchState } from "./types";
import type { SketchSpec } from "./specTypes";

import { ParagraphSketch } from "@/components/sketches/_archetypes/ParagraphSketch";
import ImageSketch from "@/components/sketches/_archetypes/ImageSketch";
import AlgorithmAnimationSketch from "@/components/sketches/_archetypes/AlgorithmAnimationSketch";

function getByPath(obj: unknown, path: string): unknown {
    const parts = path.split(".");
    let cur: any = obj;

    for (const part of parts) {
        if (!cur || typeof cur !== "object") return undefined;
        cur = cur[part];
    }

    return cur;
}

export default function SketchRenderer({
                                           spec,
                                           value,
                                           onChange,
                                           readOnly,
                                           showTitle = true,
                                       }: {
    spec: SketchSpec;
    value: SavedSketchState;
    onChange: (s: SavedSketchState) => void;
    readOnly?: boolean;
    showTitle?: boolean;
}) {
    const messages = useMessages();

    const specT = React.useMemo(
        () =>
            resolveDeepTagged(spec, (key) => {
                const v = getByPath(messages, key);
                return typeof v === "string" ? v : `@@MISSING:${key}`;
            }) as SketchSpec,
        [spec, messages],
    );
    // const messages = useMessages();


    switch (specT.archetype) {
        case "paragraph":
            return <ParagraphSketch spec={specT as any} showTitle={showTitle} />;

        case "image":
            return (
                <ImageSketch
                    spec={specT as any}
                    value={value}
                    onChange={onChange}
                    readOnly={readOnly}
                />
            );

        case "algorithm_animation":
            return (
                <AlgorithmAnimationSketch
                    spec={specT as any}
                    value={value}
                    onChange={onChange}
                    readOnly={readOnly}
                />
            );

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