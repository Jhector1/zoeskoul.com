import { describe, expect, it } from "vitest";
import { getBoardTextEditorRect, getBoardViewport } from "./layout";

describe("getBoardViewport", () => {
  it("fills a wide panel by extending the logical width", () => {
    expect(getBoardViewport({ width: 1600, height: 800 })).toEqual({
      x: 0,
      y: 0,
      width: 1600,
      height: 800,
    });
  });

  it("fills a tall panel by extending the logical height", () => {
    expect(getBoardViewport({ width: 1200, height: 1200 })).toEqual({
      x: 0,
      y: 0,
      width: 1200,
      height: 1200,
    });
  });
});

describe("getBoardTextEditorRect", () => {
  it("maps board coordinates into a resized board surface", () => {
    expect(getBoardTextEditorRect(
      { x: 600, y: 400 },
      { width: 600, height: 400 },
      { logicalWidth: 400, logicalHeight: 120, logicalFontSize: 30 },
    )).toMatchObject({
      left: 300,
      width: 200,
      height: 60,
    });
  });

  it("keeps the editor inside the bottom-right board edge", () => {
    expect(getBoardTextEditorRect(
      { x: 1190, y: 795 },
      { width: 1200, height: 800 },
      { logicalWidth: 420, logicalHeight: 136, logicalFontSize: 30 },
    )).toEqual({
      left: 780,
      top: 664,
      width: 420,
      height: 136,
      fontSize: 30,
    });
  });

  it("uses an expanded viewport without stretching the text editor", () => {
    const viewport = getBoardViewport({ width: 800, height: 800 });
    expect(getBoardTextEditorRect(
      { x: 600, y: 900 },
      { width: 800, height: 800 },
      { viewport, logicalWidth: 400, logicalHeight: 120, logicalFontSize: 30 },
    )).toMatchObject({
      left: 400,
      width: 800 / 3,
      height: 80,
    });
  });

  it("returns null before the board surface has been measured", () => {
    expect(getBoardTextEditorRect({ x: 20, y: 20 }, { width: 0, height: 0 })).toBeNull();
  });
});
