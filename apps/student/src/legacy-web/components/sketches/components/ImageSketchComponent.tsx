// src/components/sketches/ImageSketchComponent.tsx
"use client";

import * as React from "react";
import Image from "next/image";

type Marker = {
    id: string;
    /** Normalized (0..1) position in the image coordinate space. */
    x: number;
    y: number;
    label?: string;
    /** Optional Tailwind classes for the marker dot (e.g. "bg-emerald-400"). */
    dotClassName?: string;
    /** Optional click handler */
    onClick?: (id: string) => void;
};

export type ImageSketchProps = {
    src: string;
    alt: string;

    /** If you know the image size, pass it. Otherwise set `aspectRatio`. */
    width?: number;
    height?: number;

    /** width / height (e.g. 16/9). Used when width/height not provided. */
    aspectRatio?: number;

    caption?: React.ReactNode;

    markers?: Marker[];

    /** Interaction */
    initialZoom?: number; // default 1
    minZoom?: number; // default 1
    maxZoom?: number; // default 4
    zoomStep?: number; // default 0.15

    allowPan?: boolean; // default true
    allowWheelZoom?: boolean; // default true
    allowDoubleClickReset?: boolean; // default true

    /** UI */
    showControls?: boolean; // default true
    className?: string;

    /** Notify parent */
    onTransformChange?: (t: { zoom: number; x: number; y: number }) => void;
};

function cn(...xs: Array<string | false | null | undefined>) {
    return xs.filter(Boolean).join(" ");
}

function clamp(n: number, a: number, b: number) {
    return Math.max(a, Math.min(b, n));
}

/**
 * ImageSketchComponent: pan + zoom viewer (wheel/pinch-ish via pointer, drag to pan, dblclick to reset)
 * Markers are positioned in normalized image space (0..1) and move with the image.
 */
export default function ImageSketchComponent({
                                        src,
                                        alt,
                                        width,
                                        height,
                                        aspectRatio = 16 / 9,
                                        caption,
                                        markers = [],
                                        initialZoom = 1,
                                        minZoom = 1,
                                        maxZoom = 4,
                                        zoomStep = 0.15,
                                        allowPan = true,
                                        allowWheelZoom = true,
                                        allowDoubleClickReset = true,
                                        showControls = true,
                                        className,
                                        onTransformChange,
                                    }: ImageSketchProps) {
    const wrapRef = React.useRef<HTMLDivElement | null>(null);

    const [zoom, setZoom] = React.useState(() => clamp(initialZoom, minZoom, maxZoom));
    const [pos, setPos] = React.useState({ x: 0, y: 0 }); // px translation
    const [isPanning, setIsPanning] = React.useState(false);

    const panRef = React.useRef({
        active: false,
        startX: 0,
        startY: 0,
        baseX: 0,
        baseY: 0,
        pointerId: -1,
    });

    const notify = React.useCallback(
        (z: number, x: number, y: number) => onTransformChange?.({ zoom: z, x, y }),
        [onTransformChange]
    );

    const reset = React.useCallback(() => {
        const z = clamp(initialZoom, minZoom, maxZoom);
        setZoom(z);
        setPos({ x: 0, y: 0 });
        notify(z, 0, 0);
    }, [initialZoom, minZoom, maxZoom, notify]);

    // Keep translation within reasonable bounds so the image doesn't fully disappear.
    const constrainPos = React.useCallback(
        (next: { x: number; y: number }, nextZoom = zoom) => {
            const el = wrapRef.current;
            if (!el) return next;

            const rect = el.getBoundingClientRect();
            const w = rect.width;
            const h = rect.height;

            // allow panning up to half the scaled overflow + a small padding
            const overflowX = (w * nextZoom - w) / 2;
            const overflowY = (h * nextZoom - h) / 2;

            const pad = 24;
            const maxX = overflowX + pad;
            const maxY = overflowY + pad;

            return {
                x: clamp(next.x, -maxX, maxX),
                y: clamp(next.y, -maxY, maxY),
            };
        },
        [zoom]
    );

    const setZoomAroundPoint = React.useCallback(
        (nextZoomRaw: number, clientX: number, clientY: number) => {
            const el = wrapRef.current;
            if (!el) return;

            const rect = el.getBoundingClientRect();
            const cx = clientX - rect.left - rect.width / 2;
            const cy = clientY - rect.top - rect.height / 2;

            const nextZoom = clamp(nextZoomRaw, minZoom, maxZoom);
            const prevZoom = zoom;

            if (nextZoom === prevZoom) return;

            // Adjust translation so the point under the cursor stays under the cursor.
            // Derivation: p' = p + (1 - z'/z) * (cursorVector)
            const factor = 1 - nextZoom / prevZoom;

            const nextPos = constrainPos(
                {
                    x: pos.x + factor * cx,
                    y: pos.y + factor * cy,
                },
                nextZoom
            );

            setZoom(nextZoom);
            setPos(nextPos);
            notify(nextZoom, nextPos.x, nextPos.y);
        },
        [zoom, pos.x, pos.y, minZoom, maxZoom, constrainPos, notify]
    );

    const zoomBy = React.useCallback(
        (dir: 1 | -1) => {
            const el = wrapRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const midX = rect.left + rect.width / 2;
            const midY = rect.top + rect.height / 2;
            setZoomAroundPoint(zoom * (1 + zoomStep * dir), midX, midY);
        },
        [zoom, zoomStep, setZoomAroundPoint]
    );

    const onWheel = React.useCallback(
        (e: React.WheelEvent) => {
            if (!allowWheelZoom) return;

            // If user is scrolling normally on trackpad, they might intend page scroll.
            // We treat ctrlKey as "intentional zoom" + also allow small wheel zoom.
            const intentZoom = e.ctrlKey || Math.abs(e.deltaY) > 0;
            if (!intentZoom) return;

            e.preventDefault();
            const dir: 1 | -1 = e.deltaY < 0 ? 1 : -1;
            const step = zoomStep * (e.ctrlKey ? 0.75 : 1);
            const next = zoom * (1 + step * dir);
            setZoomAroundPoint(next, e.clientX, e.clientY);
        },
        [allowWheelZoom, zoom, zoomStep, setZoomAroundPoint]
    );

    const onPointerDown = React.useCallback(
        (e: React.PointerEvent) => {
            if (!allowPan) return;
            if (e.button !== 0) return;

            const el = wrapRef.current;
            if (!el) return;

            panRef.current.active = true;
            panRef.current.startX = e.clientX;
            panRef.current.startY = e.clientY;
            panRef.current.baseX = pos.x;
            panRef.current.baseY = pos.y;
            panRef.current.pointerId = e.pointerId;

            el.setPointerCapture(e.pointerId);
            setIsPanning(true);
        },
        [allowPan, pos.x, pos.y]
    );

    const onPointerMove = React.useCallback((e: React.PointerEvent) => {
        if (!panRef.current.active) return;
        if (panRef.current.pointerId !== e.pointerId) return;

        const dx = e.clientX - panRef.current.startX;
        const dy = e.clientY - panRef.current.startY;

        const next = constrainPos({
            x: panRef.current.baseX + dx,
            y: panRef.current.baseY + dy,
        });

        setPos(next);
        notify(zoom, next.x, next.y);
    }, [constrainPos, notify, zoom]);

    const endPan = React.useCallback((e: React.PointerEvent) => {
        if (panRef.current.pointerId !== e.pointerId) return;
        panRef.current.active = false;
        panRef.current.pointerId = -1;
        setIsPanning(false);
    }, []);

    const onDoubleClick = React.useCallback(() => {
        if (!allowDoubleClickReset) return;
        reset();
    }, [allowDoubleClickReset, reset]);

    // If props change (rare), keep zoom in bounds.
    React.useEffect(() => {
        setZoom((z) => clamp(z, minZoom, maxZoom));
    }, [minZoom, maxZoom]);

    const ratio = width && height ? width / height : aspectRatio;

    return (
        <section className={cn("ui-card overflow-hidden", className)}>
            {/* Header controls */}
            {showControls && (
                <div className="flex items-center justify-between gap-2 border-b border-black/10 dark:border-white/10 px-3 py-2 bg-black/[0.02] dark:bg-white/[0.04]">
                    <div className="text-xs font-semibold text-neutral-700 dark:text-white/80">
                        Image viewer
                        <span className="ml-2 font-normal text-neutral-500 dark:text-white/50">
              Drag to pan • Wheel to zoom • Double-click to reset
            </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className="ui-btn ui-btn-secondary text-xs px-2 py-1"
                            onClick={() => zoomBy(-1)}
                            aria-label="Zoom out"
                            title="Zoom out"
                        >
                            −
                        </button>
                        <div className="text-xs tabular-nums text-neutral-600 dark:text-white/70 w-14 text-center">
                            {Math.round(zoom * 100)}%
                        </div>
                        <button
                            type="button"
                            className="ui-btn ui-btn-secondary text-xs px-2 py-1"
                            onClick={() => zoomBy(1)}
                            aria-label="Zoom in"
                            title="Zoom in"
                        >
                            +
                        </button>
                        <button
                            type="button"
                            className="ui-btn ui-btn-ghost text-xs px-2 py-1"
                            onClick={reset}
                            aria-label="Reset view"
                            title="Reset"
                        >
                            Reset
                        </button>
                    </div>
                </div>
            )}

            {/* Viewer */}
            <div
                ref={wrapRef}
                className={cn(
                    "relative w-full bg-neutral-950/[0.02] dark:bg-white/[0.03]",
                    isPanning ? "cursor-grabbing" : allowPan ? "cursor-grab" : "cursor-default"
                )}
                style={{ aspectRatio: String(ratio) }}
                onWheel={onWheel}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endPan}
                onPointerCancel={endPan}
                onDoubleClick={onDoubleClick}
                role="img"
                aria-label={alt}
            >
                {/* Transform layer */}
                <div
                    className="absolute inset-0"
                    style={{
                        transform: `translate(${pos.x}px, ${pos.y}px) scale(${zoom})`,
                        transformOrigin: "center center",
                        willChange: "transform",
                    }}
                >
                    <Image
                        src={src}
                        alt={alt}
                        fill
                        sizes="(max-width: 768px) 100vw, 900px"
                        className="object-contain select-none pointer-events-none"
                        draggable={false}
                        priority={false}
                    />

                    {/* Markers (move/scale with image) */}
                    {markers.map((m) => (
                        <button
                            key={m.id}
                            type="button"
                            onClick={() => m.onClick?.(m.id)}
                            className={cn(
                                "absolute -translate-x-1/2 -translate-y-1/2",
                                "rounded-full shadow-sm",
                                "h-3 w-3",
                                m.dotClassName || "bg-emerald-400"
                            )}
                            style={{
                                left: `${clamp(m.x, 0, 1) * 100}%`,
                                top: `${clamp(m.y, 0, 1) * 100}%`,
                            }}
                            title={m.label || "Marker"}
                            aria-label={m.label || "Marker"}
                        >
                            <span className="sr-only">{m.label || "Marker"}</span>

                            {m.label && (
                                <span
                                    className={cn(
                                        "absolute left-1/2 top-full mt-2 -translate-x-1/2",
                                        "rounded-lg px-2 py-1 text-[11px] font-semibold",
                                        "bg-black/80 text-white whitespace-nowrap",
                                        "pointer-events-none"
                                    )}
                                    style={{
                                        // keep label readable by scaling inversely with zoom
                                        transform: `translateX(-50%) scale(${1 / zoom})`,
                                        transformOrigin: "top center",
                                    }}
                                >
                  {m.label}
                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Corner hint (optional) */}
                <div className="absolute bottom-2 left-2 text-[11px] font-semibold text-neutral-700/80 dark:text-white/70 bg-white/70 dark:bg-black/30 backdrop-blur px-2 py-1 rounded-lg border border-black/5 dark:border-white/10">
                    {allowPan ? "Drag" : "Pan off"} • {allowWheelZoom ? "Wheel" : "Zoom off"}
                </div>
            </div>

            {/* Caption */}
            {caption ? (
                <div className="px-3 py-2 text-sm text-neutral-700 dark:text-white/80 border-t border-black/10 dark:border-white/10">
                    {caption}
                </div>
            ) : null}
        </section>
    );
}
