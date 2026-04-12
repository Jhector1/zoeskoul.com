
import { clampDiagramNodePosition } from "./diagram-scene";
import type {DiagramBounds, DiagramMode, DiagramTabKey} from "../SqlResultsPane.types";

export type DragTarget = (HTMLElement | SVGElement) & {
    setPointerCapture?: (pointerId: number) => void;
    releasePointerCapture?: (pointerId: number) => void;
    hasPointerCapture?: (pointerId: number) => boolean;
};

export function beginDiagramNodeDrag(args: {
    target: DragTarget;
    pointerId: number;
    clientX: number;
    clientY: number;
    scale: number;
    mode: DiagramMode;
    tab: DiagramTabKey;
    id: string;
    startX: number;
    startY: number;
    onMove: (tab: DiagramTabKey, id: string, x: number, y: number) => void;
    onDragStart?: (id: string) => void;
    onDragEnd?: (id: string) => void;
}) {
    const {
        target,
        pointerId,
        clientX,
        clientY,
        scale,
        mode,
        tab,
        id,
        startX,
        startY,
        onMove,
        onDragStart,
        onDragEnd,
    } = args;

    let raf: number | null = null;
    let pending: { x: number; y: number } | null = null;

    onDragStart?.(id);

    const flush = () => {
        raf = null;
        if (!pending) return;
        onMove(tab, id, pending.x, pending.y);
        pending = null;
    };

    const move = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;

        const dx = (ev.clientX - clientX) / scale;
        const dy = (ev.clientY - clientY) / scale;

        pending = clampDiagramNodePosition(mode, startX + dx, startY + dy);

        if (raf == null) {
            raf = window.requestAnimationFrame(flush);
        }
    };

    const cleanup = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", cleanup);
        window.removeEventListener("pointercancel", cleanup);
        target.removeEventListener("lostpointercapture", cleanup as EventListener);

        if (raf != null) {
            window.cancelAnimationFrame(raf);
            raf = null;
        }

        if (pending) {
            onMove(tab, id, pending.x, pending.y);
            pending = null;
        }

        if (target.hasPointerCapture?.(pointerId)) {
            target.releasePointerCapture?.(pointerId);
        }

        onDragEnd?.(id);
    };

    target.setPointerCapture?.(pointerId);
    target.addEventListener("lostpointercapture", cleanup as EventListener);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", cleanup, { passive: true });
    window.addEventListener("pointercancel", cleanup, { passive: true });
}

export function shouldIgnoreBoardPan(target: EventTarget | null) {
    const el = target as Element | null;
    if (!el || typeof el.closest !== "function") return false;

    return Boolean(
        el.closest("[data-diagram-node-drag='true']") ||
        el.closest("[data-diagram-no-pan='true']"),
    );
}

export function shouldIgnoreBoardWheel(target: EventTarget | null) {
    const el = target as Element | null;
    if (!el || typeof el.closest !== "function") return false;

    return Boolean(el.closest("[data-diagram-no-pan='true']"));
}
type PanZoomCanvasProps = {
    width: number;
    height: number;
    fitKey?: string | number;
    fitBounds?: DiagramBounds;
    children: (ctx: { scale: number }) => React.ReactNode;
};

const MIN_SCALE = 0.35;
const MAX_SCALE = 2.5;

