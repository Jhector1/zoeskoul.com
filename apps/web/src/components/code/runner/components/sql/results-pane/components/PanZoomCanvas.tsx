
"use client";

import React from "react";
import { FLOAT_BAR, SURFACE, cn } from "../SqlResultsPane.constants";
import type { DiagramBounds } from "../SqlResultsPane.types";
import { shouldIgnoreBoardPan, shouldIgnoreBoardWheel } from "../lib/diagram-drag";

type PanZoomCanvasProps = {
    width: number;
    height: number;
    fitKey?: string | number;
    fitBounds?: DiagramBounds;
    children: (ctx: { scale: number }) => React.ReactNode;
};

const MIN_SCALE = 0.35;
const MAX_SCALE = 2.5;

function clampScale(n: number) {
    return Math.max(MIN_SCALE, Math.min(MAX_SCALE, n));
}

export function PanZoomCanvas(props: PanZoomCanvasProps) {
    const { width, height, fitKey, fitBounds, children } = props;

    const viewportRef = React.useRef<HTMLDivElement | null>(null);

    const BOARD_PAD = 1400;
    const OVERSCROLL = 180;

    const [viewportSize, setViewportSize] = React.useState({
        vw: 0,
        vh: 0,
    });

    const [view, setView] = React.useState({
        scale: 1,
        x: 0,
        y: 0,
    });
    const [isPanning, setIsPanning] = React.useState(false);

    const activeFitBounds = React.useMemo(
        () =>
            fitBounds ?? {
                x: 0,
                y: 0,
                width,
                height,
            },
        [fitBounds, width, height],
    );

    const viewRef = React.useRef(view);
    React.useEffect(() => {
        viewRef.current = view;
    }, [view]);

    const dragRef = React.useRef<{
        pointerId: number;
        startClientX: number;
        startClientY: number;
        startX: number;
        startY: number;
    } | null>(null);

    const rafRef = React.useRef<number | null>(null);
    const pendingRef = React.useRef<{ x: number; y: number } | null>(null);

    const didInitialFitRef = React.useRef(false);
    const lastFitKeyRef = React.useRef<string | number | undefined>(undefined);

    const measureViewport = React.useCallback(() => {
        const el = viewportRef.current;
        const next = el
            ? { vw: el.clientWidth, vh: el.clientHeight }
            : { vw: 0, vh: 0 };

        setViewportSize((prev) =>
            prev.vw === next.vw && prev.vh === next.vh ? prev : next,
        );

        return next;
    }, []);

    const getViewportSize = React.useCallback(() => {
        const el = viewportRef.current;
        if (!el) return viewportSize;
        return { vw: el.clientWidth, vh: el.clientHeight };
    }, [viewportSize]);

    const resolveStageMetrics = React.useCallback(
        (vw: number, vh: number) => {
            const baseStageWidth = width + BOARD_PAD * 2;
            const baseStageHeight = height + BOARD_PAD * 2;

            const minViewportStageWidth =
                vw > 0 ? Math.ceil((vw + OVERSCROLL * 2) / MIN_SCALE) : 0;
            const minViewportStageHeight =
                vh > 0 ? Math.ceil((vh + OVERSCROLL * 2) / MIN_SCALE) : 0;

            const stageWidth = Math.max(baseStageWidth, minViewportStageWidth);
            const stageHeight = Math.max(baseStageHeight, minViewportStageHeight);

            const boardLeft = Math.max(BOARD_PAD, (stageWidth - width) / 2);
            const boardTop = Math.max(BOARD_PAD, (stageHeight - height) / 2);

            return {
                stageWidth,
                stageHeight,
                boardLeft,
                boardTop,
            };
        },
        [width, height],
    );

    const stageMetrics = React.useMemo(
        () => resolveStageMetrics(viewportSize.vw, viewportSize.vh),
        [viewportSize.vw, viewportSize.vh, resolveStageMetrics],
    );

    const applyView = React.useCallback(
        (next: { scale: number; x: number; y: number }) => {
            viewRef.current = next;
            setView(next);
        },
        [],
    );

    const clampOffset = React.useCallback(
        (raw: { x: number; y: number }, nextScale: number) => {
            const { vw, vh } = getViewportSize();
            if (!vw || !vh) return raw;

            const metrics = resolveStageMetrics(vw, vh);

            const scaledStageW = metrics.stageWidth * nextScale;
            const scaledStageH = metrics.stageHeight * nextScale;

            const canPanX = scaledStageW > vw + OVERSCROLL * 2;
            const canPanY = scaledStageH > vh + OVERSCROLL * 2;

            return {
                x: canPanX
                    ? Math.min(
                        OVERSCROLL,
                        Math.max(vw - scaledStageW - OVERSCROLL, raw.x),
                    )
                    : (vw - scaledStageW) / 2,
                y: canPanY
                    ? Math.min(
                        OVERSCROLL,
                        Math.max(vh - scaledStageH - OVERSCROLL, raw.y),
                    )
                    : (vh - scaledStageH) / 2,
            };
        },
        [getViewportSize, resolveStageMetrics],
    );

    const getFitScale = React.useCallback(() => {
        const { vw, vh } = getViewportSize();
        if (!vw || !vh) return 1;

        return clampScale(
            Math.min(
                (vw - 48) / activeFitBounds.width,
                (vh - 48) / activeFitBounds.height,
            ),
        );
    }, [getViewportSize, activeFitBounds.width, activeFitBounds.height]);

    const fitToView = React.useCallback(() => {
        const { vw, vh } = getViewportSize();
        const nextScale = getFitScale();

        if (!vw || !vh) {
            applyView({ scale: nextScale, x: 0, y: 0 });
            return;
        }

        const metrics = resolveStageMetrics(vw, vh);

        const raw = {
            x:
                (vw - activeFitBounds.width * nextScale) / 2 -
                (metrics.boardLeft + activeFitBounds.x) * nextScale,
            y:
                (vh - activeFitBounds.height * nextScale) / 2 -
                (metrics.boardTop + activeFitBounds.y) * nextScale,
        };

        const clamped = clampOffset(raw, nextScale);

        applyView({
            scale: nextScale,
            x: clamped.x,
            y: clamped.y,
        });
    }, [
        getViewportSize,
        getFitScale,
        resolveStageMetrics,
        activeFitBounds.x,
        activeFitBounds.y,
        activeFitBounds.width,
        activeFitBounds.height,
        clampOffset,
        applyView,
    ]);

    React.useLayoutEffect(() => {
        measureViewport();
    }, [measureViewport]);

    React.useEffect(() => {
        const el = viewportRef.current;
        if (!el || typeof ResizeObserver === "undefined") return;

        const ro = new ResizeObserver(() => {
            measureViewport();
        });

        ro.observe(el);
        return () => ro.disconnect();
    }, [measureViewport]);

    React.useLayoutEffect(() => {
        if (!viewportSize.vw || !viewportSize.vh) return;

        const fitKeyChanged = lastFitKeyRef.current !== fitKey;

        if (!didInitialFitRef.current || fitKeyChanged) {
            fitToView();
            didInitialFitRef.current = true;
            lastFitKeyRef.current = fitKey;
            return;
        }

        const current = viewRef.current;
        const clamped = clampOffset({ x: current.x, y: current.y }, current.scale);

        if (clamped.x !== current.x || clamped.y !== current.y) {
            applyView({
                ...current,
                x: clamped.x,
                y: clamped.y,
            });
        }
    }, [viewportSize.vw, viewportSize.vh, fitKey, fitToView, clampOffset, applyView]);

    React.useEffect(() => {
        return () => {
            if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        };
    }, []);

    const flushPendingPan = React.useCallback(() => {
        rafRef.current = null;
        const pending = pendingRef.current;
        if (!pending) return;

        const current = viewRef.current;
        applyView({
            ...current,
            x: pending.x,
            y: pending.y,
        });
    }, [applyView]);

    const zoomBy = React.useCallback(
        (nextScale: number, clientX?: number, clientY?: number) => {
            const el = viewportRef.current;
            const current = viewRef.current;
            const clampedScale = clampScale(nextScale);

            if (!el || clientX == null || clientY == null) {
                const clampedOffset = clampOffset(
                    { x: current.x, y: current.y },
                    clampedScale,
                );

                applyView({
                    scale: clampedScale,
                    x: clampedOffset.x,
                    y: clampedOffset.y,
                });
                return;
            }

            const rect = el.getBoundingClientRect();
            const px = clientX - rect.left;
            const py = clientY - rect.top;

            const worldX = (px - current.x) / current.scale;
            const worldY = (py - current.y) / current.scale;

            const raw = {
                x: px - worldX * clampedScale,
                y: py - worldY * clampedScale,
            };

            const clampedOffset = clampOffset(raw, clampedScale);

            applyView({
                scale: clampedScale,
                x: clampedOffset.x,
                y: clampedOffset.y,
            });
        },
        [clampOffset, applyView],
    );
    React.useEffect(() => {
        const el = viewportRef.current;
        if (!el) return;

        const handleWheel = (e: WheelEvent) => {
            if (shouldIgnoreBoardWheel(e.target)) {
                return;
            }

            e.preventDefault();

            const factor = e.deltaY < 0 ? 1.08 : 0.92;
            zoomBy(viewRef.current.scale * factor, e.clientX, e.clientY);
        };

        el.addEventListener("wheel", handleWheel, { passive: false });

        return () => {
            el.removeEventListener("wheel", handleWheel);
        };
    }, [zoomBy]);

    const zoomCentered = React.useCallback(
        (nextScale: number) => {
            const el = viewportRef.current;
            if (!el) {
                const current = viewRef.current;
                const clampedScale = clampScale(nextScale);
                const clampedOffset = clampOffset(
                    { x: current.x, y: current.y },
                    clampedScale,
                );

                applyView({
                    scale: clampedScale,
                    x: clampedOffset.x,
                    y: clampedOffset.y,
                });
                return;
            }

            const rect = el.getBoundingClientRect();
            zoomBy(nextScale, rect.left + rect.width / 2, rect.top + rect.height / 2);
        },
        [zoomBy, clampOffset, applyView],
    );

    const resetView = React.useCallback(() => {
        fitToView();
    }, [fitToView]);



    const onPointerDown = React.useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        if (shouldIgnoreBoardPan(e.target)) return;

        e.preventDefault();

        dragRef.current = {
            pointerId: e.pointerId,
            startClientX: e.clientX,
            startClientY: e.clientY,
            startX: viewRef.current.x,
            startY: viewRef.current.y,
        };

        setIsPanning(true);
        e.currentTarget.setPointerCapture(e.pointerId);
    }, []);

    const onPointerMove = React.useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== e.pointerId) return;

            const raw = {
                x: drag.startX + (e.clientX - drag.startClientX),
                y: drag.startY + (e.clientY - drag.startClientY),
            };

            pendingRef.current = clampOffset(raw, viewRef.current.scale);

            if (rafRef.current == null) {
                rafRef.current = requestAnimationFrame(flushPendingPan);
            }
        },
        [clampOffset, flushPendingPan],
    );

    const endPan = React.useCallback((pointerId: number, target: HTMLDivElement) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== pointerId) return;

        dragRef.current = null;
        pendingRef.current = null;

        if (rafRef.current != null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }

        if (target.hasPointerCapture(pointerId)) {
            target.releasePointerCapture(pointerId);
        }

        setIsPanning(false);
    }, []);

    const onPointerUp = React.useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            endPan(e.pointerId, e.currentTarget);
        },
        [endPan],
    );

    const onPointerCancel = React.useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            endPan(e.pointerId, e.currentTarget);
        },
        [endPan],
    );

    return (
        <div className={cn("relative h-full min-h-0 overflow-hidden", SURFACE)}>
            <div
                ref={viewportRef}
                className={cn(
                    "absolute inset-0 overflow-hidden touch-none select-none",
                    isPanning ? "cursor-grabbing" : "cursor-grab",
                )}

                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
            >
                <div
                    className="absolute left-0 top-0 will-change-transform"
                    style={{
                        width: stageMetrics.stageWidth,
                        height: stageMetrics.stageHeight,
                        transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
                        transformOrigin: "0 0",
                        backfaceVisibility: "hidden",
                        WebkitBackfaceVisibility: "hidden",
                        backgroundImage: `
      linear-gradient(to right, rgba(148,163,184,0.10) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(148,163,184,0.10) 1px, transparent 1px)
    `,
                        backgroundSize: "40px 40px",
                    }}
                >
                    <div
                        className="absolute"
                        style={{
                            left: stageMetrics.boardLeft,
                            top: stageMetrics.boardTop,
                            width,
                            height,
                        }}
                    >
                        {children({ scale: view.scale })}
                    </div>
                </div>
            </div>

            <div
                className={cn(
                    "absolute right-3 top-3 z-30 flex items-center gap-1 px-1.5 py-1.5",
                    FLOAT_BAR,
                )}
            >
                <button
                    type="button"
                    onClick={() => zoomCentered(view.scale * 0.9)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-white/75 dark:hover:bg-white/[0.08]"
                >
                    −
                </button>

                <div className="min-w-[48px] text-center text-[10px] font-medium text-neutral-500 dark:text-white/55">
                    {Math.round(view.scale * 100)}%
                </div>

                <button
                    type="button"
                    onClick={() => zoomCentered(view.scale * 1.1)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-white/75 dark:hover:bg-white/[0.08]"
                >
                    +
                </button>

                <button
                    type="button"
                    onClick={resetView}
                    className="inline-flex h-7 items-center justify-center rounded-md px-2 text-[10px] font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-white/75 dark:hover:bg-white/[0.08]"
                >
                    Reset
                </button>
            </div>

            <div
                className={cn(
                    "absolute bottom-3 left-3 z-30 px-2.5 py-1.5 text-[10px] font-medium text-neutral-500 dark:text-white/45",
                    FLOAT_BAR,
                )}
            >
                Drag board • wheel to zoom • drag nodes
            </div>
        </div>
    );
}
