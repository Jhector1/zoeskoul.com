import type { BoardPoint } from "./types";

export const BOARD_WIDTH = 1200;
export const BOARD_HEIGHT = 800;
export const BOARD_ASPECT_RATIO = BOARD_WIDTH / BOARD_HEIGHT;

export type BoardSurfaceSize = {
  width: number;
  height: number;
};

export type BoardViewport = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BoardTextEditorRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Expands the logical board in whichever direction the panel is larger.
 * This fills the entire available tool pane without stretching circles,
 * arrows, handwriting, or previously saved coordinates.
 */
export function getBoardViewport(surface: BoardSurfaceSize): BoardViewport {
  if (surface.width <= 0 || surface.height <= 0) {
    return { x: 0, y: 0, width: BOARD_WIDTH, height: BOARD_HEIGHT };
  }

  const surfaceAspect = surface.width / surface.height;
  if (!Number.isFinite(surfaceAspect) || surfaceAspect <= 0) {
    return { x: 0, y: 0, width: BOARD_WIDTH, height: BOARD_HEIGHT };
  }

  if (surfaceAspect >= BOARD_ASPECT_RATIO) {
    return {
      x: 0,
      y: 0,
      width: BOARD_HEIGHT * surfaceAspect,
      height: BOARD_HEIGHT,
    };
  }

  return {
    x: 0,
    y: 0,
    width: BOARD_WIDTH,
    height: BOARD_WIDTH / surfaceAspect,
  };
}

/**
 * Converts a board-space text anchor into a CSS-pixel editor rectangle.
 * The editor stays fully inside the visible board and follows board resizing.
 */
export function getBoardTextEditorRect(
  anchor: BoardPoint,
  surface: BoardSurfaceSize,
  options: {
    viewport?: BoardViewport;
    logicalWidth?: number;
    logicalHeight?: number;
    logicalFontSize?: number;
  } = {},
): BoardTextEditorRect | null {
  if (surface.width <= 0 || surface.height <= 0) return null;

  const viewport = options.viewport ?? getBoardViewport(surface);
  const scaleX = surface.width / viewport.width;
  const scaleY = surface.height / viewport.height;
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
    return null;
  }

  const maxLogicalWidth = Math.max(96, viewport.width - 32);
  const maxLogicalHeight = Math.max(64, viewport.height - 32);
  const logicalWidth = clamp(options.logicalWidth ?? 420, Math.min(220, maxLogicalWidth), maxLogicalWidth);
  const logicalHeight = clamp(options.logicalHeight ?? 136, Math.min(72, maxLogicalHeight), maxLogicalHeight);
  const logicalFontSize = clamp(options.logicalFontSize ?? 30, 16, 72);

  const logicalLeft = clamp(anchor.x, viewport.x, viewport.x + viewport.width - logicalWidth);
  const preferredTop = anchor.y - logicalFontSize * 1.35;
  const logicalTop = clamp(preferredTop, viewport.y, viewport.y + viewport.height - logicalHeight);

  return {
    left: (logicalLeft - viewport.x) * scaleX,
    top: (logicalTop - viewport.y) * scaleY,
    width: logicalWidth * scaleX,
    height: logicalHeight * scaleY,
    fontSize: clamp(logicalFontSize * Math.min(scaleX, scaleY), 14, 30),
  };
}
