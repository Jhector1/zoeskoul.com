import {
  BOARD_DOCUMENT_VERSION,
  type BoardDocument,
  type BoardElement,
  type BoardPoint,
} from "./types";

const MAX_ELEMENTS = 1500;
const MAX_POINTS_PER_STROKE = 4000;
const MAX_TEXT_LENGTH = 2000;
const FALLBACK_COLOR = "#111827";

function finite(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function point(value: unknown): BoardPoint | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const x = finite(raw.x, Number.NaN);
  const y = finite(raw.y, Number.NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function base(value: Record<string, unknown>) {
  const id = typeof value.id === "string" && value.id.trim() ? value.id : crypto.randomUUID();
  const color = typeof value.color === "string" && value.color.trim() ? value.color : FALLBACK_COLOR;
  const strokeWidth = clamp(finite(value.strokeWidth, 3), 1, 24);
  return { id, color, strokeWidth };
}

function normalizeElement(value: unknown): BoardElement | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const common = base(raw);

  if (raw.type === "stroke") {
    const points = Array.isArray(raw.points)
      ? raw.points.slice(0, MAX_POINTS_PER_STROKE).map(point).filter((item): item is BoardPoint => Boolean(item))
      : [];
    if (points.length < 2) return null;
    return { ...common, type: "stroke", points };
  }

  if (raw.type === "text") {
    const text = typeof raw.text === "string" ? raw.text.slice(0, MAX_TEXT_LENGTH) : "";
    if (!text.trim()) return null;
    return {
      ...common,
      type: "text",
      x: finite(raw.x),
      y: finite(raw.y),
      text,
      fontSize: clamp(finite(raw.fontSize, 28), 10, 96),
    };
  }

  if (raw.type === "rectangle" || raw.type === "ellipse") {
    return {
      ...common,
      type: raw.type,
      x: finite(raw.x),
      y: finite(raw.y),
      width: finite(raw.width),
      height: finite(raw.height),
    };
  }

  if (raw.type === "arrow") {
    const start = point(raw.start);
    const end = point(raw.end);
    if (!start || !end) return null;
    return { ...common, type: "arrow", start, end };
  }

  return null;
}

export function emptyBoardDocument(): BoardDocument {
  return { version: BOARD_DOCUMENT_VERSION, elements: [] };
}

export function parseBoardDocument(body: string): BoardDocument {
  if (!body.trim()) return emptyBoardDocument();

  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const elements = Array.isArray(parsed.elements)
      ? parsed.elements.slice(0, MAX_ELEMENTS).map(normalizeElement).filter((item): item is BoardElement => Boolean(item))
      : [];
    return { version: BOARD_DOCUMENT_VERSION, elements };
  } catch {
    return emptyBoardDocument();
  }
}

export function serializeBoardDocument(document: BoardDocument) {
  return JSON.stringify({ version: BOARD_DOCUMENT_VERSION, elements: document.elements });
}


export function boardTextLines(text: string) {
  return text.replace(/\r\n?/g, "\n").split("\n");
}

export function boardTextBounds(element: Extract<BoardElement, { type: "text" }>) {
  const lines = boardTextLines(element.text);
  const lineHeight = element.fontSize * 1.25;
  const width = Math.max(
    element.fontSize,
    ...lines.map((line) => Math.max(1, line.length) * element.fontSize * 0.58),
  );
  const height = element.fontSize + Math.max(0, lines.length - 1) * lineHeight;
  return {
    x: element.x,
    y: element.y - element.fontSize,
    width,
    height,
    lineHeight,
    lines,
  };
}

export type BoardResizeHandle =
  | "north-west"
  | "north-east"
  | "south-east"
  | "south-west"
  | "arrow-start"
  | "arrow-end";

export type BoardElementBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function boardElementBounds(element: BoardElement): BoardElementBounds {
  if (element.type === "text") {
    const bounds = boardTextBounds(element);
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  }

  if (element.type === "rectangle" || element.type === "ellipse") {
    return {
      x: Math.min(element.x, element.x + element.width),
      y: Math.min(element.y, element.y + element.height),
      width: Math.abs(element.width),
      height: Math.abs(element.height),
    };
  }

  if (element.type === "arrow") {
    return {
      x: Math.min(element.start.x, element.end.x),
      y: Math.min(element.start.y, element.end.y),
      width: Math.abs(element.end.x - element.start.x),
      height: Math.abs(element.end.y - element.start.y),
    };
  }

  if (element.type === "stroke") {
    const xs = element.points.map((item) => item.x);
    const ys = element.points.map((item) => item.y);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
  }

  return { x: 0, y: 0, width: 0, height: 0 };
}

function resizedBox(
  bounds: BoardElementBounds,
  handle: Exclude<BoardResizeHandle, "arrow-start" | "arrow-end">,
  target: BoardPoint,
): BoardElementBounds {
  const left = bounds.x;
  const top = bounds.y;
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  const anchor = handle === "north-west"
    ? { x: right, y: bottom }
    : handle === "north-east"
      ? { x: left, y: bottom }
      : handle === "south-west"
        ? { x: right, y: top }
        : { x: left, y: top };

  return {
    x: Math.min(anchor.x, target.x),
    y: Math.min(anchor.y, target.y),
    width: Math.max(2, Math.abs(target.x - anchor.x)),
    height: Math.max(2, Math.abs(target.y - anchor.y)),
  };
}

/** Resizes any selected board element from one shared set of handles. */
export function resizeBoardElement(
  element: BoardElement,
  handle: BoardResizeHandle,
  target: BoardPoint,
): BoardElement {
  if (element.type === "arrow") {
    if (handle === "arrow-start") return { ...element, start: target };
    if (handle === "arrow-end") return { ...element, end: target };
    return element;
  }

  if (handle === "arrow-start" || handle === "arrow-end") return element;
  const before = boardElementBounds(element);
  const after = resizedBox(before, handle, target);

  if (element.type === "rectangle" || element.type === "ellipse") {
    return { ...element, x: after.x, y: after.y, width: after.width, height: after.height };
  }

  if (element.type === "text") {
    const widthScale = after.width / Math.max(1, before.width);
    const heightScale = after.height / Math.max(1, before.height);
    const scale = clamp(Math.min(widthScale, heightScale), 0.25, 4);
    const fontSize = clamp(element.fontSize * scale, 10, 96);
    return {
      ...element,
      x: after.x,
      y: after.y + fontSize,
      fontSize,
    };
  }

  if (element.type === "stroke") {
    const scaleX = after.width / Math.max(1, before.width);
    const scaleY = after.height / Math.max(1, before.height);
    return {
      ...element,
      points: element.points.map((item) => ({
        x: after.x + (item.x - before.x) * scaleX,
        y: after.y + (item.y - before.y) * scaleY,
      })),
    };
  }

  return element;
}

export function translateBoardElement(element: BoardElement, dx: number, dy: number): BoardElement {
  if (element.type === "stroke") {
    return { ...element, points: element.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
  }
  if (element.type === "text") {
    return { ...element, x: element.x + dx, y: element.y + dy };
  }
  if (element.type === "rectangle" || element.type === "ellipse") {
    return { ...element, x: element.x + dx, y: element.y + dy };
  }
  if (element.type === "arrow") {
    return {
      ...element,
      start: { x: element.start.x + dx, y: element.start.y + dy },
      end: { x: element.end.x + dx, y: element.end.y + dy },
    };
  }
  return element;
}

function distanceToSegment(pointValue: BoardPoint, a: BoardPoint, b: BoardPoint) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(pointValue.x - a.x, pointValue.y - a.y);
  const t = clamp(((pointValue.x - a.x) * dx + (pointValue.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(pointValue.x - (a.x + t * dx), pointValue.y - (a.y + t * dy));
}

export function hitTestBoardElement(element: BoardElement, target: BoardPoint, tolerance = 14) {
  if (element.type === "text") {
    const bounds = boardTextBounds(element);
    return target.x >= bounds.x - tolerance && target.x <= bounds.x + bounds.width + tolerance &&
      target.y >= bounds.y - tolerance && target.y <= bounds.y + bounds.height + tolerance;
  }

  if (element.type === "rectangle" || element.type === "ellipse") {
    const left = Math.min(element.x, element.x + element.width) - tolerance;
    const right = Math.max(element.x, element.x + element.width) + tolerance;
    const top = Math.min(element.y, element.y + element.height) - tolerance;
    const bottom = Math.max(element.y, element.y + element.height) + tolerance;
    return target.x >= left && target.x <= right && target.y >= top && target.y <= bottom;
  }

  if (element.type === "arrow") {
    return distanceToSegment(target, element.start, element.end) <= tolerance + element.strokeWidth;
  }

  if (element.type === "stroke") {
    for (let index = 1; index < element.points.length; index += 1) {
      if (distanceToSegment(target, element.points[index - 1], element.points[index]) <= tolerance + element.strokeWidth) {
        return true;
      }
    }
  }
  return false;
}

export function findTopBoardElement(elements: BoardElement[], target: BoardPoint) {
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    if (hitTestBoardElement(elements[index], target)) return elements[index];
  }
  return null;
}
