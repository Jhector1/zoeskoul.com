import { describe, expect, it } from "vitest";
import {
  boardTextBounds,
  emptyBoardDocument,
  findTopBoardElement,
  parseBoardDocument,
  resizeBoardElement,
  serializeBoardDocument,
  translateBoardElement,
} from "./document";

const rectangle = {
  id: "r1",
  type: "rectangle" as const,
  color: "#111827",
  strokeWidth: 3,
  x: 10,
  y: 20,
  width: 100,
  height: 80,
};

describe("board document", () => {
  it("returns an empty document for invalid input", () => {
    expect(parseBoardDocument("not-json")).toEqual(emptyBoardDocument());
  });

  it("round trips supported board elements", () => {
    const document = { version: 1 as const, elements: [rectangle] };
    expect(parseBoardDocument(serializeBoardDocument(document))).toEqual(document);
  });

  it("moves an element without mutating the original", () => {
    expect(translateBoardElement(rectangle, 5, -2)).toMatchObject({ x: 15, y: 18 });
    expect(rectangle).toMatchObject({ x: 10, y: 20 });
  });


  it("measures multiline text for selection and hit testing", () => {
    const text = {
      id: "t1",
      type: "text" as const,
      color: "#111827",
      strokeWidth: 3,
      x: 100,
      y: 100,
      text: "first line\nsecond line",
      fontSize: 20,
    };

    expect(boardTextBounds(text)).toMatchObject({
      x: 100,
      y: 80,
      height: 45,
    });
    expect(findTopBoardElement([text], { x: 120, y: 115 })?.id).toBe("t1");
  });


  it("resizes rectangles from a selected corner", () => {
    expect(resizeBoardElement(rectangle, "south-east", { x: 210, y: 180 })).toMatchObject({
      x: 10,
      y: 20,
      width: 200,
      height: 160,
    });
  });

  it("resizes a freehand stroke through the same selection contract", () => {
    const stroke = {
      id: "s1",
      type: "stroke" as const,
      color: "#111827",
      strokeWidth: 3,
      points: [{ x: 10, y: 20 }, { x: 110, y: 100 }],
    };
    expect(resizeBoardElement(stroke, "south-east", { x: 210, y: 180 })).toMatchObject({
      points: [{ x: 10, y: 20 }, { x: 210, y: 180 }],
    });
  });

  it("edits either arrow endpoint without moving the other endpoint", () => {
    const arrow = {
      id: "a1",
      type: "arrow" as const,
      color: "#111827",
      strokeWidth: 3,
      start: { x: 10, y: 20 },
      end: { x: 100, y: 120 },
    };
    expect(resizeBoardElement(arrow, "arrow-end", { x: 220, y: 240 })).toEqual({
      ...arrow,
      end: { x: 220, y: 240 },
    });
  });

  it("scales selected text while keeping its top-left anchor stable", () => {
    const text = {
      id: "t1",
      type: "text" as const,
      color: "#111827",
      strokeWidth: 3,
      x: 100,
      y: 130,
      text: "editable",
      fontSize: 30,
    };
    const resized = resizeBoardElement(text, "south-east", { x: 400, y: 220 });
    expect(resized.type).toBe("text");
    if (resized.type === "text") {
      expect(resized.x).toBe(100);
      expect(resized.fontSize).toBeGreaterThan(30);
    }
  });

  it("selects the top-most element at a point", () => {
    const top = { ...rectangle, id: "top", x: 20, y: 30 };
    expect(findTopBoardElement([rectangle, top], { x: 40, y: 50 })?.id).toBe("top");
  });
});
