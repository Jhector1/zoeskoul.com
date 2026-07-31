import { describe, expect, it } from "vitest";

import {
  DEFAULT_BOARD_CAMERA,
  boardPointAtClientPoint,
  fitBoardCameraToBounds,
  getBoardCameraViewport,
  panBoardCameraByClientDelta,
  zoomBoardCameraAtClientPoint,
} from "./viewport";

const surface = { width: 1200, height: 800 };

describe("board viewport camera", () => {
  it("preserves the legacy board at the default camera", () => {
    expect(getBoardCameraViewport(surface, DEFAULT_BOARD_CAMERA)).toEqual({
      x: 0,
      y: 0,
      width: 1200,
      height: 800,
    });
  });

  it("keeps the board point under the cursor fixed while zooming", () => {
    const cursor = { x: 900, y: 200 };
    const before = boardPointAtClientPoint(surface, DEFAULT_BOARD_CAMERA, cursor);
    const camera = zoomBoardCameraAtClientPoint(
      surface,
      DEFAULT_BOARD_CAMERA,
      cursor,
      2,
    );
    const after = boardPointAtClientPoint(surface, camera, cursor);

    expect(camera.zoom).toBe(2);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("pans into negative and positive board coordinates", () => {
    const leftAndUp = panBoardCameraByClientDelta(
      surface,
      DEFAULT_BOARD_CAMERA,
      { x: 240, y: 160 },
    );
    expect(leftAndUp).toEqual({ x: -240, y: -160, zoom: 1 });

    const rightAndDown = panBoardCameraByClientDelta(
      surface,
      DEFAULT_BOARD_CAMERA,
      { x: -300, y: -200 },
    );
    expect(rightAndDown).toEqual({ x: 300, y: 200, zoom: 1 });
  });

  it("fits content whose coordinates cross the old board boundaries", () => {
    const camera = fitBoardCameraToBounds(surface, {
      x: -600,
      y: -300,
      width: 2400,
      height: 1400,
    }, 100);
    const viewport = getBoardCameraViewport(surface, camera);

    expect(viewport.x).toBeLessThanOrEqual(-700);
    expect(viewport.y).toBeLessThanOrEqual(-400);
    expect(viewport.x + viewport.width).toBeGreaterThanOrEqual(1900);
    expect(viewport.y + viewport.height).toBeGreaterThanOrEqual(1200);
  });

  it("clamps zoom to safe limits", () => {
    expect(
      zoomBoardCameraAtClientPoint(surface, DEFAULT_BOARD_CAMERA, { x: 0, y: 0 }, 100).zoom,
    ).toBe(4);
    expect(
      zoomBoardCameraAtClientPoint(surface, DEFAULT_BOARD_CAMERA, { x: 0, y: 0 }, 0.001).zoom,
    ).toBe(0.2);
  });
});
