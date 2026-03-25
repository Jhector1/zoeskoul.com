// src/components/review/sketches/_archetypes/ImageSketchArchetype.tsx
"use client";

import * as React from "react";
import type { SavedSketchState } from "../subjects/types";
import type { ImageSketchSpec } from "../subjects/specTypes";
import MathMarkdown from "@/components/markdown/MathMarkdown";
// import ImageSketch from "@/components/sketches/ImageSketchComponent";
import ImageSketchComponent from "@/components/sketches/components/ImageSketchComponent";

type Transform = { zoom: number; x: number; y: number };

function getTransform(value: SavedSketchState): Transform | null {
    return (value as any)?.imageTransform ?? null;
}

function setTransform(value: SavedSketchState, t: Transform): SavedSketchState {
    return { ...(value as any), imageTransform: t } as any;
}

export default function ImageSketch({
                                                 spec,
                                                 value,
                                                 onChange,
                                                 readOnly,
                                             }: {
    spec: ImageSketchSpec;
    value: SavedSketchState;
    onChange: (s: SavedSketchState) => void;
    readOnly?: boolean;
}) {
    const saved = spec.rememberTransform ? getTransform(value) : null;

    return (
        <div className="mt-4">
            <ImageSketchComponent
                src={spec.src}
                alt={spec.alt}
                width={spec.width}
                height={spec.height}
                aspectRatio={spec.aspectRatio}
                className={spec.className}
                markers={spec.markers ?? []}
                initialZoom={saved?.zoom ?? spec.initialZoom ?? 1}
                minZoom={spec.minZoom ?? 1}
                maxZoom={spec.maxZoom ?? 4}
                zoomStep={spec.zoomStep ?? 0.15}
                allowPan={spec.allowPan ?? true}
                allowWheelZoom={spec.allowWheelZoom ?? true}
                allowDoubleClickReset={spec.allowDoubleClickReset ?? true}
                showControls={spec.showControls ?? true}
                caption={
                    spec.captionMarkdown ? (
                        <MathMarkdown content={spec.captionMarkdown} />
                    ) : null
                }
                onTransformChange={(t) => {
                    if (readOnly) return;
                    if (!spec.rememberTransform) return;
                    onChange(setTransform(value, t));
                }}
            />
        </div>
    );
}
