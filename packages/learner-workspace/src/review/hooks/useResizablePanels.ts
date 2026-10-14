"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { beginViewportResizeDrag } from "../../ui/resizeDrag";

export type ReviewPanelKind = "left" | "right";

export const REVIEW_PANEL_RECOVERABLE_PX = 48;
export const REVIEW_CENTER_RECOVERABLE_PX = 48;
const REVIEW_PANEL_KEYBOARD_STEP_PX = 32;

export function resolveReviewPanelBounds(args: {
    containerWidth: number;
    oppositeOccupiedWidth: number;
    handleWidth: number;
    panelMinimum?: number;
    centerMinimum?: number;
}) {
    const panelMinimum = args.panelMinimum ?? REVIEW_PANEL_RECOVERABLE_PX;
    const centerMinimum = args.centerMinimum ?? REVIEW_CENTER_RECOVERABLE_PX;
    const maximum =
        args.containerWidth -
        Math.max(0, args.oppositeOccupiedWidth) -
        Math.max(0, args.handleWidth) -
        centerMinimum;

    return {
        minimum: panelMinimum,
        maximum: Math.max(panelMinimum, maximum),
    };
}

export function resolveReviewPanelWidth(args: {
    kind: ReviewPanelKind;
    clientX: number;
    containerLeft: number;
    containerWidth: number;
    minimum: number;
    maximum: number;
}) {
    const raw =
        args.kind === "left"
            ? args.clientX - args.containerLeft
            : args.containerLeft + args.containerWidth - args.clientX;
    return Math.min(args.maximum, Math.max(args.minimum, Math.round(raw)));
}

function occupiedWidth(container: HTMLElement, selector: string) {
    const element = container.querySelector<HTMLElement>(selector);
    return element?.getBoundingClientRect().width ?? 0;
}

function panelForHandle(handle: HTMLElement, kind: ReviewPanelKind) {
    const element =
        kind === "left" ? handle.previousElementSibling : handle.nextElementSibling;
    return element instanceof HTMLElement ? element : null;
}

export function useResizablePanels(args?: {
    leftDefault?: number;
    rightDefault?: number;
    panelMinimum?: number;
    centerMinimum?: number;
}) {
    const {
        leftDefault = 300,
        rightDefault = 700,
        panelMinimum = REVIEW_PANEL_RECOVERABLE_PX,
        centerMinimum = REVIEW_CENTER_RECOVERABLE_PX,
    } = args ?? {};

    const [leftCollapsed, setLeftCollapsed] = useState(false);
    const [rightCollapsed, setRightCollapsed] = useState(false);
    const [leftW, setLeftW] = useState(leftDefault);
    const [rightW, setRightW] = useState(rightDefault);
    const cleanupRef = useRef<(() => void) | null>(null);

    useEffect(() => () => cleanupRef.current?.(), []);

    const beginPanelDrag = useCallback(
        (kind: ReviewPanelKind, event: React.PointerEvent<HTMLDivElement>) => {
            if (event.button !== 0) return;
            event.preventDefault();
            cleanupRef.current?.();

            const handle = event.currentTarget;
            const panel = panelForHandle(handle, kind);
            const container = handle.parentElement;
            if (!panel || !container) return;

            const containerRect = container.getBoundingClientRect();
            const oppositeOccupiedWidth =
                kind === "left"
                    ? occupiedWidth(container, "[data-review-right-rail]") +
                      occupiedWidth(container, "[data-review-right-resize-handle]")
                    : occupiedWidth(container, "[data-review-left-rail]") +
                      occupiedWidth(container, "[data-review-left-resize-handle]");
            const bounds = resolveReviewPanelBounds({
                containerWidth: containerRect.width,
                oppositeOccupiedWidth,
                handleWidth: handle.getBoundingClientRect().width,
                panelMinimum,
                centerMinimum,
            });
            const pointerId = event.pointerId;
            const previousTransition = panel.style.transition;
            const finishViewportDrag = beginViewportResizeDrag("col-resize");
            let latestClientX = event.clientX;
            let currentWidth = kind === "left" ? leftW : rightW;
            let frame: number | null = null;
            let cleaned = false;

            panel.style.transition = "none";
            panel.dataset.resizeActive = "true";
            try {
                handle.setPointerCapture(pointerId);
            } catch {
                // Window listeners and the viewport shield remain authoritative.
            }

            const applyLatestWidth = () => {
                frame = null;
                currentWidth = resolveReviewPanelWidth({
                    kind,
                    clientX: latestClientX,
                    containerLeft: containerRect.left,
                    containerWidth: containerRect.width,
                    ...bounds,
                });
                panel.style.width = `${currentWidth}px`;
            };

            const onMove = (moveEvent: PointerEvent) => {
                latestClientX = moveEvent.clientX;
                if (frame == null) frame = requestAnimationFrame(applyLatestWidth);
            };

            const cleanup = () => {
                if (cleaned) return;
                cleaned = true;
                if (frame != null) {
                    cancelAnimationFrame(frame);
                    applyLatestWidth();
                }
                window.removeEventListener("pointermove", onMove, true);
                window.removeEventListener("pointerup", cleanup, true);
                window.removeEventListener("pointercancel", cleanup, true);
                handle.removeEventListener("lostpointercapture", cleanup);
                try {
                    if (handle.hasPointerCapture(pointerId)) {
                        handle.releasePointerCapture(pointerId);
                    }
                } catch {
                    // Capture may already be released by the browser.
                }
                finishViewportDrag();

                if (kind === "left") setLeftW(currentWidth);
                else setRightW(currentWidth);

                delete panel.dataset.resizeActive;
                requestAnimationFrame(() => {
                    if (panel.isConnected) panel.style.transition = previousTransition;
                });
                if (cleanupRef.current === cleanup) cleanupRef.current = null;
            };

            window.addEventListener("pointermove", onMove, true);
            window.addEventListener("pointerup", cleanup, true);
            window.addEventListener("pointercancel", cleanup, true);
            handle.addEventListener("lostpointercapture", cleanup);
            cleanupRef.current = cleanup;
        },
        [centerMinimum, leftW, panelMinimum, rightW],
    );

    const resizeWithKeyboard = useCallback(
        (kind: ReviewPanelKind, event: React.KeyboardEvent<HTMLDivElement>) => {
            const handle = event.currentTarget;
            const container = handle.parentElement;
            if (!container) return;

            const oppositeOccupiedWidth =
                kind === "left"
                    ? occupiedWidth(container, "[data-review-right-rail]") +
                      occupiedWidth(container, "[data-review-right-resize-handle]")
                    : occupiedWidth(container, "[data-review-left-rail]") +
                      occupiedWidth(container, "[data-review-left-resize-handle]");
            const bounds = resolveReviewPanelBounds({
                containerWidth: container.getBoundingClientRect().width,
                oppositeOccupiedWidth,
                handleWidth: handle.getBoundingClientRect().width,
                panelMinimum,
                centerMinimum,
            });
            const current = kind === "left" ? leftW : rightW;
            let next: number | null = null;

            if (event.key === "Home") next = bounds.minimum;
            else if (event.key === "End") next = bounds.maximum;
            else if (event.key === "ArrowLeft") {
                next = current + (kind === "right" ? REVIEW_PANEL_KEYBOARD_STEP_PX : -REVIEW_PANEL_KEYBOARD_STEP_PX);
            } else if (event.key === "ArrowRight") {
                next = current + (kind === "right" ? -REVIEW_PANEL_KEYBOARD_STEP_PX : REVIEW_PANEL_KEYBOARD_STEP_PX);
            }
            if (next == null) return;

            event.preventDefault();
            const clamped = Math.min(bounds.maximum, Math.max(bounds.minimum, next));
            if (kind === "left") setLeftW(clamped);
            else setRightW(clamped);
        },
        [centerMinimum, leftW, panelMinimum, rightW],
    );

    return {
        leftCollapsed,
        setLeftCollapsed,
        rightCollapsed,
        setRightCollapsed,
        leftW,
        setLeftW,
        rightW,
        setRightW,
        onPointerDownLeftHandle: (event: React.PointerEvent<HTMLDivElement>) =>
            beginPanelDrag("left", event),
        onPointerDownRightHandle: (event: React.PointerEvent<HTMLDivElement>) =>
            beginPanelDrag("right", event),
        onKeyDownLeftHandle: (event: React.KeyboardEvent<HTMLDivElement>) =>
            resizeWithKeyboard("left", event),
        onKeyDownRightHandle: (event: React.KeyboardEvent<HTMLDivElement>) =>
            resizeWithKeyboard("right", event),
    };
}
