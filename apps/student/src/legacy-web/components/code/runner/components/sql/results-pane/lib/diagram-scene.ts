
import type {
    Box,
    DiagramConfig,
    DiagramMode,
    DiagramScene,
    SchemaModel,
} from "../SqlResultsPane.types";

export function getDiagramConfig(mode: DiagramMode): DiagramConfig {
    if (mode === "chen") {
        return {
            minWidth: 1500,
            minHeight: 980,
            leftPad: 280,
            topPad: 220,
            rightPad: 420,
            bottomPad: 320,
            extraRight: 170,
            extraBottom: 110,
            minX: -2600,
            minY: -2200,
            maxX: 4200,
            maxY: 3600,
        };
    }

    if (mode === "erd") {
        return {
            minWidth: 1320,
            minHeight: 860,
            leftPad: 220,
            topPad: 180,
            rightPad: 320,
            bottomPad: 220,
            extraRight: 70,
            extraBottom: 40,
            minX: -2200,
            minY: -1800,
            maxX: 3800,
            maxY: 3200,
        };
    }

    return {
        minWidth: 1100,
        minHeight: 760,
        leftPad: 180,
        topPad: 160,
        rightPad: 260,
        bottomPad: 200,
        extraRight: 0,
        extraBottom: 0,
        minX: -2000,
        minY: -1600,
        maxX: 3200,
        maxY: 2600,
    };
}

export function clampDiagramNodePosition(mode: DiagramMode, x: number, y: number) {
    const cfg = getDiagramConfig(mode);
    return {
        x: Math.min(cfg.maxX, Math.max(cfg.minX, x)),
        y: Math.min(cfg.maxY, Math.max(cfg.minY, y)),
    };
}

export function clampDiagramBoxes(mode: DiagramMode, boxes: Box[]) {
    return boxes.map((box) => {
        const next = clampDiagramNodePosition(mode, box.x, box.y);
        return { ...box, x: next.x, y: next.y };
    });
}

export function buildDiagramScene(rawBoxes: Box[], mode: DiagramMode): DiagramScene {
    const cfg = getDiagramConfig(mode);

    if (!rawBoxes.length) {
        return {
            width: cfg.minWidth,
            height: cfg.minHeight,
            boxes: [],
            fitBounds: {
                x: 0,
                y: 0,
                width: cfg.minWidth,
                height: cfg.minHeight,
            },
        };
    }

    const maxBoxW = Math.max(...rawBoxes.map((b) => b.w));
    const maxBoxH = Math.max(...rawBoxes.map((b) => b.h));

    const offsetX = cfg.leftPad - cfg.minX;
    const offsetY = cfg.topPad - cfg.minY;

    const boxes = rawBoxes.map((box) => ({
        ...box,
        x: box.x + offsetX,
        y: box.y + offsetY,
    }));

    const worldWidth =
        cfg.maxX - cfg.minX + maxBoxW + cfg.extraRight;
    const worldHeight =
        cfg.maxY - cfg.minY + maxBoxH + cfg.extraBottom;

    const width = Math.max(
        cfg.minWidth,
        cfg.leftPad + worldWidth + cfg.rightPad,
    );
    const height = Math.max(
        cfg.minHeight,
        cfg.topPad + worldHeight + cfg.bottomPad,
    );

    const minRenderedX = Math.min(...boxes.map((b) => b.x));
    const minRenderedY = Math.min(...boxes.map((b) => b.y));
    const maxRenderedRight = Math.max(
        ...boxes.map((b) => b.x + b.w + cfg.extraRight),
    );
    const maxRenderedBottom = Math.max(
        ...boxes.map((b) => b.y + b.h + cfg.extraBottom),
    );

    const FIT_PAD = 96;

    const fitX = Math.max(0, minRenderedX - FIT_PAD);
    const fitY = Math.max(0, minRenderedY - FIT_PAD);
    const fitRight = Math.min(width, maxRenderedRight + FIT_PAD);
    const fitBottom = Math.min(height, maxRenderedBottom + FIT_PAD);

    return {
        width,
        height,
        boxes,
        fitBounds: {
            x: fitX,
            y: fitY,
            width: Math.max(1, fitRight - fitX),
            height: Math.max(1, fitBottom - fitY),
        },
    };
}

export function buildDiagramFitKey(mode: DiagramMode, schema: SchemaModel) {
    const tablesKey = schema.tables
        .map((t) => `${t.id}:${t.columns.length}`)
        .join("|");
    const relsKey = schema.relations.map((r) => r.id).join("|");
    return `${mode}::${tablesKey}::${relsKey}`;
}

type DragTarget = (HTMLElement | SVGElement) & {
    setPointerCapture?: (pointerId: number) => void;
    releasePointerCapture?: (pointerId: number) => void;
    hasPointerCapture?: (pointerId: number) => boolean;
};

