import type { BoardPoint } from "./types";
import {
  getBoardViewport,
  type BoardSurfaceSize,
  type BoardViewport,
} from "./layout";

export const BOARD_MIN_ZOOM = 0.2;
export const BOARD_MAX_ZOOM = 4;
export const DEFAULT_BOARD_CAMERA: BoardCamera = {
  x: 0,
  y: 0,
  zoom: 1,
};

export type BoardCamera = {
  /** Left edge of the visible camera in board coordinates. */
  x: number;
  /** Top edge of the visible camera in board coordinates. */
  y: number;
  /** 1 = the legacy 1200 × 800 board scale. */
  zoom: number;
};

export type BoardContentBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BoardClientPoint = {
  x: number;
  y: number;
};

function finite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

export function clampBoardZoom(value: number) {
  return Math.min(BOARD_MAX_ZOOM, Math.max(BOARD_MIN_ZOOM, finite(value, 1)));
}

export function normalizeBoardCamera(camera: BoardCamera): BoardCamera {
  return {
    x: finite(camera.x, 0),
    y: finite(camera.y, 0),
    zoom: clampBoardZoom(camera.zoom),
  };
}

/**
 * Derives the SVG viewBox for a camera. The old fixed board is exactly the
 * camera { x: 0, y: 0, zoom: 1 }, which keeps legacy documents positioned as
 * before while allowing the camera to travel through negative/positive space.
 */
export function getBoardCameraViewport(
  surface: BoardSurfaceSize,
  camera: BoardCamera,
): BoardViewport {
  const base = getBoardViewport(surface);
  const normalized = normalizeBoardCamera(camera);
  return {
    x: normalized.x,
    y: normalized.y,
    width: base.width / normalized.zoom,
    height: base.height / normalized.zoom,
  };
}

/** Convert a local CSS-pixel point in the board surface into board space. */
export function boardPointAtClientPoint(
  surface: BoardSurfaceSize,
  camera: BoardCamera,
  client: BoardClientPoint,
): BoardPoint {
  const viewport = getBoardCameraViewport(surface, camera);
  const width = Math.max(1, surface.width);
  const height = Math.max(1, surface.height);
  return {
    x: viewport.x + (client.x / width) * viewport.width,
    y: viewport.y + (client.y / height) * viewport.height,
  };
}

/**
 * Zooms around the pointer instead of the canvas origin, so the point under the
 * cursor remains stationary. This works for wheel zoom and touch pinch.
 */
export function zoomBoardCameraAtClientPoint(
  surface: BoardSurfaceSize,
  camera: BoardCamera,
  client: BoardClientPoint,
  requestedZoom: number,
): BoardCamera {
  const zoom = clampBoardZoom(requestedZoom);
  const anchor = boardPointAtClientPoint(surface, camera, client);
  const base = getBoardViewport(surface);
  const width = base.width / zoom;
  const height = base.height / zoom;
  const surfaceWidth = Math.max(1, surface.width);
  const surfaceHeight = Math.max(1, surface.height);

  return normalizeBoardCamera({
    x: anchor.x - (client.x / surfaceWidth) * width,
    y: anchor.y - (client.y / surfaceHeight) * height,
    zoom,
  });
}

/**
 * Pans by a CSS-pixel drag delta. Moving the pointer right reveals content to
 * the left, matching familiar map/whiteboard behavior.
 */
export function panBoardCameraByClientDelta(
  surface: BoardSurfaceSize,
  camera: BoardCamera,
  delta: BoardClientPoint,
): BoardCamera {
  const viewport = getBoardCameraViewport(surface, camera);
  const scaleX = viewport.width / Math.max(1, surface.width);
  const scaleY = viewport.height / Math.max(1, surface.height);
  return normalizeBoardCamera({
    ...camera,
    x: camera.x - delta.x * scaleX,
    y: camera.y - delta.y * scaleY,
  });
}

/**
 * Fits every content bound into the visible surface with logical padding.
 * Empty documents should use DEFAULT_BOARD_CAMERA instead.
 */
export function fitBoardCameraToBounds(
  surface: BoardSurfaceSize,
  bounds: BoardContentBounds,
  padding = 96,
): BoardCamera {
  const safePadding = Math.max(0, finite(padding, 96));
  const base = getBoardViewport(surface);
  const paddedWidth = Math.max(1, bounds.width + safePadding * 2);
  const paddedHeight = Math.max(1, bounds.height + safePadding * 2);
  const zoom = clampBoardZoom(
    Math.min(base.width / paddedWidth, base.height / paddedHeight),
  );
  const visibleWidth = base.width / zoom;
  const visibleHeight = base.height / zoom;
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;

  return normalizeBoardCamera({
    x: centerX - visibleWidth / 2,
    y: centerY - visibleHeight / 2,
    zoom,
  });
}
