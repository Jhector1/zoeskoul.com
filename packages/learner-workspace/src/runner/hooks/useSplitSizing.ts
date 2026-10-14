"use client";

import * as React from "react";
import type { TerminalDock } from "@zoeskoul/learner-workspace/runner/types";
import { clamp } from "@zoeskoul/learner-workspace/runner/utils/text";
import { beginViewportResizeDrag } from "../../ui/resizeDrag";

type Size = {
    w: number;
    h: number;
};

function safeRoundSize(value: number) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.round(value));
}

function sameSize(a: Size, b: Size) {
    return a.w === b.w && a.h === b.h;
}

export function useSplitSizing(args: {
    height: number;

    showEditor: boolean;
    showTerminal: boolean;
    dock: TerminalDock;
    disabled: boolean;
    initialTerminalSize?: number;

    mainRef: React.RefObject<HTMLDivElement | null>;
    requestLayout: () => void;

    splitPx?: number;

    hardMinEditorH?: number;
    hardMinTermH?: number;
    hardMinEditorW?: number;
    hardMinTermW?: number;
}) {
    const {
        height,
        showEditor,
        showTerminal,
        dock,
        disabled,
        initialTerminalSize = 240,
        mainRef,
        requestLayout,

        splitPx = 8,

        hardMinEditorH = 80,
        hardMinTermH = 80,
        hardMinEditorW = 48,
        hardMinTermW = 48,
    } = args;

    const hasSplit = showEditor && showTerminal;

    const [mainSize, setMainSize] = React.useState<Size>({ w: 0, h: 0 });
    const mainSizeRef = React.useRef<Size>({ w: 0, h: 0 });
    const resizeRafRef = React.useRef<number | null>(null);
    const layoutRafRef = React.useRef<number | null>(null);
    const mountedRef = React.useRef(false);
    const requestLayoutRef = React.useRef(requestLayout);

    requestLayoutRef.current = requestLayout;

    React.useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;

            if (resizeRafRef.current != null) {
                cancelAnimationFrame(resizeRafRef.current);
                resizeRafRef.current = null;
            }

            if (layoutRafRef.current != null) {
                cancelAnimationFrame(layoutRafRef.current);
                layoutRafRef.current = null;
            }
        };
    }, []);

    const measureMain = React.useCallback(() => {
        const el = mainRef.current;
        if (!el || !mountedRef.current) return;

        const r = el.getBoundingClientRect();
        const next: Size = {
            w: safeRoundSize(r.width),
            h: safeRoundSize(r.height),
        };

        if (sameSize(mainSizeRef.current, next)) return;

        mainSizeRef.current = next;
        setMainSize((prev) => (sameSize(prev, next) ? prev : next));
    }, [mainRef]);

    const scheduleMeasureMain = React.useCallback(() => {
        if (resizeRafRef.current != null) return;

        resizeRafRef.current = requestAnimationFrame(() => {
            resizeRafRef.current = null;
            measureMain();
        });
    }, [measureMain]);

    React.useEffect(() => {
        const el = mainRef.current;
        if (!el) return;

        measureMain();

        if (typeof ResizeObserver === "undefined") {
            window.addEventListener("resize", scheduleMeasureMain);
            return () => {
                window.removeEventListener("resize", scheduleMeasureMain);
                if (resizeRafRef.current != null) {
                    cancelAnimationFrame(resizeRafRef.current);
                    resizeRafRef.current = null;
                }
            };
        }

        const ro = new ResizeObserver(() => {
            scheduleMeasureMain();
        });

        ro.observe(el);

        return () => {
            ro.disconnect();

            if (resizeRafRef.current != null) {
                cancelAnimationFrame(resizeRafRef.current);
                resizeRafRef.current = null;
            }
        };
    }, [mainRef, measureMain, scheduleMeasureMain]);

    const totalH = Math.max(0, mainSize.h || height);
    const totalW = Math.max(0, mainSize.w || 0);

    const [termH, setTermH] = React.useState<number>(() =>
        clamp(initialTerminalSize, hardMinTermH, 720),
    );
    const [termW, setTermW] = React.useState<number>(() =>
        clamp(initialTerminalSize, hardMinTermW, 960),
    );

    const userResizedRef = React.useRef(false);
    const restoreFocusRef = React.useRef<HTMLElement | null>(null);
    const [isResizing, setIsResizing] = React.useState(false);
    const dragCleanupRef = React.useRef<(() => void) | null>(null);

    React.useEffect(() => {
        return () => {
            dragCleanupRef.current?.();
        };
    }, []);

    const scheduleLayout = React.useCallback(() => {
        if (layoutRafRef.current != null) return;

        layoutRafRef.current = requestAnimationFrame(() => {
            layoutRafRef.current = null;
            requestLayoutRef.current?.();
        });
    }, []);

    const bottomMaxTerm = hasSplit
        ? getBottomMaxTerm({
            totalH,
            splitPx,
            hardMinEditorH,
            hardMinTermH,
        })
        : totalH;

    const rightMaxTerm = hasSplit
        ? getRightMaxTerm({
            totalW,
            splitPx,
            hardMinEditorW,
            hardMinTermW,
        })
        : termW;

    const effectiveTermH = hasSplit
        ? clamp(termH, hardMinTermH, bottomMaxTerm)
        : 0;

    const effectiveTermW = hasSplit
        ? clamp(termW, hardMinTermW, rightMaxTerm)
        : clamp(termW, hardMinTermW, rightMaxTerm);

    const bottomTermH = effectiveTermH;
    const bottomEditorH = hasSplit
        ? Math.max(hardMinEditorH, totalH - splitPx - bottomTermH)
        : totalH;

    const rightTotalH = totalH;

    const resizeBottomTo = React.useCallback((next: number) => {
        const maxTerm = getBottomMaxTerm({
            totalH,
            splitPx,
            hardMinEditorH,
            hardMinTermH,
        });

        const clamped = clamp(next, hardMinTermH, maxTerm);
        userResizedRef.current = true;
        setTermH((prev) => (prev === clamped ? prev : clamped));
        scheduleLayout();
    }, [
        totalH,
        splitPx,
        hardMinEditorH,
        hardMinTermH,
        scheduleLayout,
    ]);

    const resizeRightTo = React.useCallback((next: number) => {
        const maxTerm = getRightMaxTerm({
            totalW,
            splitPx,
            hardMinEditorW,
            hardMinTermW,
        });

        const clamped = clamp(next, hardMinTermW, maxTerm);
        userResizedRef.current = true;
        setTermW((prev) => (prev === clamped ? prev : clamped));
        scheduleLayout();
    }, [
        totalW,
        splitPx,
        hardMinEditorW,
        hardMinTermW,
        scheduleLayout,
    ]);

    const nudgeTerm = React.useCallback((delta: number) => {
        if (dock === "bottom") {
            resizeBottomTo(effectiveTermH + delta);
        } else {
            resizeRightTo(effectiveTermW + delta);
        }
    }, [dock, effectiveTermH, effectiveTermW, resizeBottomTo, resizeRightTo]);

    const splitDragRef = React.useRef<{
        startX: number;
        startY: number;
        startSize: number;
        dock: TerminalDock;
    } | null>(null);

    const onPointerDownSplit = React.useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            if (disabled) return;
            e.preventDefault();

            const divider = e.currentTarget;
            const pointerId = e.pointerId;
            try {
                divider.setPointerCapture(pointerId);
            } catch {
                // Global listeners and the viewport shield keep the drag active.
            }

            userResizedRef.current = true;

            const active = document.activeElement as HTMLElement | null;
            restoreFocusRef.current = active;

            if (
                active &&
                (active.tagName === "INPUT" ||
                    active.tagName === "TEXTAREA" ||
                    active.getAttribute("contenteditable") === "true")
            ) {
                try {
                    active.blur();
                } catch {
                    // Some embedded controls do not expose a callable blur.
                }
            }

            splitDragRef.current = {
                startX: e.clientX,
                startY: e.clientY,
                startSize: dock === "bottom" ? effectiveTermH : effectiveTermW,
                dock,
            };
            setIsResizing(true);

            // Embedded PDF viewers use a browser/native surface that can swallow
            // pointer movement as soon as the cursor crosses into the preview.
            // Install the drag shield synchronously, before React has time to
            // render the declarative shield, so every file type uses the same
            // continuous split-resize interaction.
            const endViewportDrag = beginViewportResizeDrag(
                dock === "bottom" ? "row-resize" : "col-resize",
            );

            const pdfEmbeds = [...mainRef.current?.querySelectorAll<HTMLElement>(
                'object[type="application/pdf"], embed[type="application/pdf"]',
            ) ?? []].map((element) => ({
                element,
                pointerEvents: element.style.pointerEvents,
            }));

            for (const { element } of pdfEmbeds) {
                element.style.pointerEvents = "none";
            }

            let latestPointer: PointerEvent | null = null;
            let moveRaf: number | null = null;
            const applyLatestPointer = () => {
                moveRaf = null;
                const ev = latestPointer;
                const d = splitDragRef.current;
                if (!d || !ev) return;

                if (d.dock === "bottom") {
                    resizeBottomTo(d.startSize - (ev.clientY - d.startY));
                } else {
                    resizeRightTo(d.startSize - (ev.clientX - d.startX));
                }
            };

            const onMove = (ev: PointerEvent) => {
                latestPointer = ev;
                if (moveRaf == null) moveRaf = requestAnimationFrame(applyLatestPointer);
            };

            const onUp = () => {
                if (moveRaf != null) {
                    cancelAnimationFrame(moveRaf);
                    applyLatestPointer();
                }
                splitDragRef.current = null;
                dragCleanupRef.current = null;
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
                window.removeEventListener("pointercancel", onUp);
                try {
                    if (divider.hasPointerCapture(pointerId)) {
                        divider.releasePointerCapture(pointerId);
                    }
                } catch {
                    // Capture may already be released by the browser.
                }
                endViewportDrag();
                for (const { element, pointerEvents } of pdfEmbeds) {
                    element.style.pointerEvents = pointerEvents;
                }
                if (mountedRef.current) setIsResizing(false);

                const toRestore = restoreFocusRef.current;
                restoreFocusRef.current = null;

                if (toRestore && typeof toRestore.focus === "function") {
                    try {
                        toRestore.focus({ preventScroll: true });
                    } catch {
                        try {
                            toRestore.focus();
                        } catch {
                            // Focus restoration is best effort after resizing.
                        }
                    }
                }
            };

            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
            window.addEventListener("pointercancel", onUp);
            dragCleanupRef.current = onUp;
        },
        [disabled, dock, effectiveTermH, effectiveTermW, mainRef, resizeBottomTo, resizeRightTo],
    );

    const onKeyDownSplit = React.useCallback(
        (e: React.KeyboardEvent<HTMLDivElement>) => {
            if (disabled || !hasSplit) return;

            const step = dock === "bottom" ? 24 : 32;
            const bigStep = step * 4;

            switch (e.key) {
                case "ArrowUp":
                case "ArrowLeft":
                    e.preventDefault();
                    nudgeTerm(bigStep);
                    return;
                case "ArrowDown":
                case "ArrowRight":
                    e.preventDefault();
                    nudgeTerm(-bigStep);
                    return;
                case "Home":
                    e.preventDefault();
                    if (dock === "bottom") resizeBottomTo(hardMinTermH);
                    else resizeRightTo(hardMinTermW);
                    return;
                case "End":
                    e.preventDefault();
                    if (dock === "bottom") resizeBottomTo(bottomMaxTerm);
                    else resizeRightTo(rightMaxTerm);
                    return;
            }
        },
        [
            disabled,
            hasSplit,
            dock,
            nudgeTerm,
            resizeBottomTo,
            resizeRightTo,
            hardMinTermH,
            hardMinTermW,
            bottomMaxTerm,
            rightMaxTerm,
        ],
    );

    const ariaOrientation: "horizontal" | "vertical" =
        dock === "bottom" ? "horizontal" : "vertical";

    const separatorProps = {
        role: "separator" as const,
        tabIndex: disabled || !hasSplit ? -1 : 0,
        "aria-orientation": ariaOrientation,
        "aria-label": dock === "bottom" ? "Resize terminal height" : "Resize terminal width",
        "aria-valuemin": dock === "bottom" ? hardMinTermH : hardMinTermW,
        "aria-valuemax": Math.round(dock === "bottom" ? bottomMaxTerm : rightMaxTerm),
        "aria-valuenow": Math.round(dock === "bottom" ? effectiveTermH : effectiveTermW),
        onKeyDown: onKeyDownSplit,
        onPointerDown: onPointerDownSplit,
    } satisfies React.HTMLAttributes<HTMLDivElement> & {
        role: "separator";
        "aria-orientation": "horizontal" | "vertical";
        "aria-valuemin": number;
        "aria-valuemax": number;
        "aria-valuenow": number;
    };

    return {
        splitPx,

        termH: effectiveTermH,
        termW: effectiveTermW,

        setTermH,
        setTermW,

        bottomTotalH: totalH,
        rightTotalH,

        bottomTermH,
        bottomEditorH,

        mainW: mainSize.w,
        mainH: mainSize.h,

        bottomMaxTerm,
        rightMaxTerm,

        isResizing,

        onPointerDownSplit,
        separatorProps,
    };
}

function getBottomMaxTerm(args: {
    totalH: number;
    splitPx: number;
    hardMinEditorH: number;
    hardMinTermH: number;
}) {
    const { totalH, splitPx, hardMinEditorH, hardMinTermH } = args;
    return Math.max(hardMinTermH, totalH - splitPx - hardMinEditorH);
}

function getRightMaxTerm(args: {
    totalW: number;
    splitPx: number;
    hardMinEditorW: number;
    hardMinTermW: number;
}) {
    const { totalW, splitPx, hardMinEditorW, hardMinTermW } = args;
    return Math.max(hardMinTermW, totalW - splitPx - hardMinEditorW);
}
