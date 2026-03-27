"use client";

import * as React from "react";
import type { TerminalDock } from "../types";
import { clamp } from "../utils/text";

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

    minEditorH?: number;
    minTermH?: number;
    minEditorW?: number;
    minTermW?: number;

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

        minEditorH = 160,
        minTermH = 140,
        minEditorW = 320,
        minTermW = 240,

        hardMinEditorH = 80,
        hardMinTermH = 80,
        hardMinEditorW = 180,
        hardMinTermW = 180,
    } = args;

    const hasSplit = showEditor && showTerminal;

    const [mainW, setMainW] = React.useState(0);
    const [mainH, setMainH] = React.useState(0);

    React.useEffect(() => {
        const el = mainRef.current;
        if (!el) return;

        const update = () => {
            const r = el.getBoundingClientRect();
            setMainW(r.width);
            setMainH(r.height);
        };

        const ro = new ResizeObserver(update);
        ro.observe(el);
        update();

        return () => ro.disconnect();
    }, [mainRef]);

    const totalH = Math.max(0, mainH || height);
    const totalW = Math.max(0, mainW || 0);

    const [termH, setTermH] = React.useState<number>(() =>
        clamp(initialTerminalSize, hardMinTermH, 720),
    );
    const [termW, setTermW] = React.useState<number>(() =>
        clamp(initialTerminalSize, hardMinTermW, 960),
    );

    const userResizedRef = React.useRef(false);
    const restoreFocusRef = React.useRef<HTMLElement | null>(null);
    const layoutRafRef = React.useRef<number | null>(null);

    const scheduleLayout = React.useCallback(() => {
        if (layoutRafRef.current != null) return;

        layoutRafRef.current = requestAnimationFrame(() => {
            layoutRafRef.current = null;
            requestLayout();
        });
    }, [requestLayout]);

    React.useEffect(() => {
        return () => {
            if (layoutRafRef.current != null) {
                cancelAnimationFrame(layoutRafRef.current);
                layoutRafRef.current = null;
            }
        };
    }, []);

    const bottomMaxTerm = hasSplit
        ? getBottomMaxTerm({
            totalH,
            splitPx,
            minEditorH,
            minTermH,
            hardMinEditorH,
            hardMinTermH,
        })
        : totalH;

    const rightMaxTerm = hasSplit
        ? getRightMaxTerm({
            totalW,
            splitPx,
            minEditorW,
            minTermW,
            hardMinEditorW,
            hardMinTermW,
        })
        : termW;

    const autoHalfH = (totalH - splitPx) / 2;
    const autoHalfW = (totalW - splitPx) / 2;

    const effectiveTermH = hasSplit
        ? userResizedRef.current
            ? clamp(termH, hardMinTermH, bottomMaxTerm)
            : clamp(autoHalfH, hardMinTermH, bottomMaxTerm)
        : 0;

    const effectiveTermW = hasSplit
        ? userResizedRef.current
            ? clamp(termW, hardMinTermW, rightMaxTerm)
            : clamp(autoHalfW, hardMinTermW, rightMaxTerm)
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
            minEditorH,
            minTermH,
            hardMinEditorH,
            hardMinTermH,
        });

        userResizedRef.current = true;
        setTermH(clamp(next, hardMinTermH, maxTerm));
        scheduleLayout();
    }, [
        totalH,
        splitPx,
        minEditorH,
        minTermH,
        hardMinEditorH,
        hardMinTermH,
        scheduleLayout,
    ]);

    const resizeRightTo = React.useCallback((next: number) => {
        const maxTerm = getRightMaxTerm({
            totalW,
            splitPx,
            minEditorW,
            minTermW,
            hardMinEditorW,
            hardMinTermW,
        });

        userResizedRef.current = true;
        setTermW(clamp(next, hardMinTermW, maxTerm));
        scheduleLayout();
    }, [
        totalW,
        splitPx,
        minEditorW,
        minTermW,
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
                } catch {}
            }

            splitDragRef.current = {
                startX: e.clientX,
                startY: e.clientY,
                startSize: dock === "bottom" ? effectiveTermH : effectiveTermW,
                dock,
            };

            const prevSelect = document.body.style.userSelect;
            const prevCursor = document.body.style.cursor;

            document.body.style.userSelect = "none";
            document.body.style.cursor = dock === "bottom" ? "row-resize" : "col-resize";

            const onMove = (ev: PointerEvent) => {
                const d = splitDragRef.current;
                if (!d) return;

                if (d.dock === "bottom") {
                    const dy = ev.clientY - d.startY;
                    resizeBottomTo(d.startSize - dy);
                } else {
                    const dx = ev.clientX - d.startX;
                    resizeRightTo(d.startSize - dx);
                }
            };

            const onUp = () => {
                splitDragRef.current = null;
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
                document.body.style.userSelect = prevSelect;
                document.body.style.cursor = prevCursor;

                const toRestore = restoreFocusRef.current;
                restoreFocusRef.current = null;

                if (toRestore && typeof toRestore.focus === "function") {
                    try {
                        toRestore.focus({ preventScroll: true });
                    } catch {
                        try {
                            toRestore.focus();
                        } catch {}
                    }
                }
            };

            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
        },
        [disabled, dock, effectiveTermH, effectiveTermW, resizeBottomTo, resizeRightTo],
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

        mainW,
        mainH,

        bottomMaxTerm,
        rightMaxTerm,

        onPointerDownSplit,
        separatorProps,
    };
}

function getBottomMaxTerm(args: {
    totalH: number;
    splitPx: number;
    minEditorH: number;
    minTermH: number;
    hardMinEditorH: number;
    hardMinTermH: number;
}) {
    const { totalH, splitPx, minEditorH, minTermH, hardMinEditorH, hardMinTermH } = args;

    const minEditorEff = Math.min(
        minEditorH,
        Math.max(hardMinEditorH, totalH - splitPx - hardMinTermH),
    );
    const minTermEff = Math.min(
        minTermH,
        Math.max(hardMinTermH, totalH - splitPx - hardMinEditorH),
    );

    const maxTerm = Math.max(hardMinTermH, totalH - splitPx - minEditorEff);
    return Math.max(minTermEff, maxTerm);
}

function getRightMaxTerm(args: {
    totalW: number;
    splitPx: number;
    minEditorW: number;
    minTermW: number;
    hardMinEditorW: number;
    hardMinTermW: number;
}) {
    const { totalW, splitPx, minEditorW, minTermW, hardMinEditorW, hardMinTermW } = args;

    const minEditorEff = Math.min(
        minEditorW,
        Math.max(hardMinEditorW, totalW - splitPx - hardMinTermW),
    );
    const minTermEff = Math.min(
        minTermW,
        Math.max(hardMinTermW, totalW - splitPx - hardMinEditorW),
    );

    const maxTerm = Math.max(hardMinTermW, totalW - splitPx - minEditorEff);
    return Math.max(minTermEff, maxTerm);
}