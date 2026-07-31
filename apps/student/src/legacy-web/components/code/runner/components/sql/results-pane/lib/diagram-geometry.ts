
import type { Box } from "../SqlResultsPane.types";

export function sideOf(box: Box, side: "left" | "right" | "top" | "bottom") {
    if (side === "left") return { x: box.x, y: box.y + box.h / 2, dx: -1, dy: 0 };
    if (side === "right") return { x: box.x + box.w, y: box.y + box.h / 2, dx: 1, dy: 0 };
    if (side === "top") return { x: box.x + box.w / 2, y: box.y, dx: 0, dy: -1 };
    return { x: box.x + box.w / 2, y: box.y + box.h, dx: 0, dy: 1 };
}

export function pickSides(a: Box, b: Box) {
    const acx = a.x + a.w / 2;
    const acy = a.y + a.h / 2;
    const bcx = b.x + b.w / 2;
    const bcy = b.y + b.h / 2;
    const dx = bcx - acx;
    const dy = bcy - acy;

    if (Math.abs(dx) >= Math.abs(dy)) {
        return dx >= 0
            ? { aSide: "right" as const, bSide: "left" as const }
            : { aSide: "left" as const, bSide: "right" as const };
    }

    return dy >= 0
        ? { aSide: "bottom" as const, bSide: "top" as const }
        : { aSide: "top" as const, bSide: "bottom" as const };
}

export function orthogonalPath(
    start: { x: number; y: number },
    end: { x: number; y: number },
    horizontalFirst: boolean,
) {
    if (horizontalFirst) {
        const mx = (start.x + end.x) / 2;
        return `M ${start.x} ${start.y} L ${mx} ${start.y} L ${mx} ${end.y} L ${end.x} ${end.y}`;
    }

    const my = (start.y + end.y) / 2;
    return `M ${start.x} ${start.y} L ${start.x} ${my} L ${end.x} ${my} L ${end.x} ${end.y}`;
}

