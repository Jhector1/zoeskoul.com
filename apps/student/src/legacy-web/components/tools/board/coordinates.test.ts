import { describe, expect, it } from "vitest";
import { clientPointToBoardPoint } from "./coordinates";

function svgMock(options: {
  matrix?: { a: number; b: number; c: number; d: number; e: number; f: number } | null;
  bounds?: { left: number; top: number; width: number; height: number };
  preserveAspectRatio?: string | null;
}) {
  const matrix = options.matrix;
  return {
    viewBox: { baseVal: { x: 0, y: 0, width: 1200, height: 800 } },
    getScreenCTM: () => matrix ? {
      inverse: () => matrix,
    } : null,
    createSVGPoint: () => ({
      x: 0,
      y: 0,
      matrixTransform(transform: typeof matrix) {
        if (!transform) throw new Error("missing transform");
        return {
          x: this.x * transform.a + this.y * transform.c + transform.e,
          y: this.x * transform.b + this.y * transform.d + transform.f,
        };
      },
    }),
    getBoundingClientRect: () => ({
      left: options.bounds?.left ?? 0,
      top: options.bounds?.top ?? 0,
      width: options.bounds?.width ?? 1200,
      height: options.bounds?.height ?? 800,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
    getAttribute: (name: string) => name === "preserveAspectRatio"
      ? options.preserveAspectRatio ?? null
      : null,
  } as unknown as SVGSVGElement;
}

describe("clientPointToBoardPoint", () => {
  it("uses the inverse SVG screen transform for panel offsets and scaling", () => {
    const svg = svgMock({
      // screen -> board: remove (100, 50), then divide by 0.5
      matrix: { a: 2, b: 0, c: 0, d: 2, e: -200, f: -100 },
    });

    expect(clientPointToBoardPoint(svg, 350, 225)).toEqual({ x: 500, y: 350 });
  });

  it("removes preserveAspectRatio letterboxing in the fallback path", () => {
    const svg = svgMock({
      matrix: null,
      bounds: { left: 20, top: 30, width: 600, height: 600 },
      preserveAspectRatio: "xMidYMid meet",
    });

    // 1200x800 rendered into 600x600 creates 100px vertical padding.
    expect(clientPointToBoardPoint(svg, 320, 180)).toEqual({ x: 600, y: 100 });
  });

  it("clamps captured pointer movement to the board edges", () => {
    const svg = svgMock({
      matrix: { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 },
    });

    expect(clientPointToBoardPoint(svg, -50, 900)).toEqual({ x: 0, y: 800 });
  });
});
