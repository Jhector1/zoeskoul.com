import type { BoardPoint } from "./types";

type ViewBoxLike = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function finitePoint(point: BoardPoint | null): point is BoardPoint {
  return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y));
}

function readViewBox(svg: SVGSVGElement): ViewBoxLike | null {
  const viewBox = svg.viewBox?.baseVal;
  if (!viewBox || viewBox.width <= 0 || viewBox.height <= 0) return null;
  return {
    x: viewBox.x,
    y: viewBox.y,
    width: viewBox.width,
    height: viewBox.height,
  };
}

function clampToViewBox(point: BoardPoint, viewBox: ViewBoxLike | null) {
  if (!viewBox) return point;
  return {
    x: clamp(point.x, viewBox.x, viewBox.x + viewBox.width),
    y: clamp(point.y, viewBox.y, viewBox.y + viewBox.height),
  };
}

function alignmentOffset(
  align: string,
  viewportSize: number,
  renderedSize: number,
  axis: "x" | "y",
) {
  const token = axis === "x"
    ? align.match(/x(Min|Mid|Max)/)?.[1]
    : align.match(/Y(Min|Mid|Max)/)?.[1];

  if (token === "Max") return viewportSize - renderedSize;
  if (token === "Mid") return (viewportSize - renderedSize) / 2;
  return 0;
}

/**
 * Fallback for browsers/test environments where getScreenCTM is unavailable.
 * It mirrors SVG's preserveAspectRatio behavior so letterboxing is excluded
 * from pointer coordinates instead of becoming a false toolbar-sized offset.
 */
function clientPointToViewBoxFallback(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  viewBox: ViewBoxLike,
): BoardPoint | null {
  const bounds = svg.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return null;

  const preserveAspectRatio = (svg.getAttribute("preserveAspectRatio") || "xMidYMid meet").trim();
  if (preserveAspectRatio === "none") {
    return {
      x: viewBox.x + ((clientX - bounds.left) / bounds.width) * viewBox.width,
      y: viewBox.y + ((clientY - bounds.top) / bounds.height) * viewBox.height,
    };
  }

  const [align = "xMidYMid", mode = "meet"] = preserveAspectRatio.split(/\s+/);
  const scaleX = bounds.width / viewBox.width;
  const scaleY = bounds.height / viewBox.height;
  const scale = mode === "slice" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
  if (!Number.isFinite(scale) || scale <= 0) return null;

  const renderedWidth = viewBox.width * scale;
  const renderedHeight = viewBox.height * scale;
  const offsetX = alignmentOffset(align, bounds.width, renderedWidth, "x");
  const offsetY = alignmentOffset(align, bounds.height, renderedHeight, "y");

  return {
    x: viewBox.x + (clientX - bounds.left - offsetX) / scale,
    y: viewBox.y + (clientY - bounds.top - offsetY) / scale,
  };
}

/**
 * Converts browser viewport coordinates into the SVG board's own viewBox.
 * getScreenCTM().inverse() is the source of truth because it includes panel
 * offsets, scrolling, CSS transforms, browser zoom, responsive scaling, and
 * SVG preserveAspectRatio letterboxing.
 */
export function clientPointToBoardPoint(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  options: { clamp?: boolean } = {},
): BoardPoint {
  const viewBox = readViewBox(svg);
  let localPoint: BoardPoint | null = null;

  try {
    const matrix = svg.getScreenCTM?.();
    if (matrix && typeof svg.createSVGPoint === "function") {
      const point = svg.createSVGPoint();
      point.x = clientX;
      point.y = clientY;
      const transformed = point.matrixTransform(matrix.inverse());
      localPoint = { x: transformed.x, y: transformed.y };
    }
  } catch {
    // Detached SVGs and a few test/browser states can temporarily lack a CTM.
  }

  if (!finitePoint(localPoint) && viewBox) {
    localPoint = clientPointToViewBoxFallback(svg, clientX, clientY, viewBox);
  }

  if (!finitePoint(localPoint)) {
    localPoint = { x: viewBox?.x ?? 0, y: viewBox?.y ?? 0 };
  }

  return options.clamp === false ? localPoint : clampToViewBox(localPoint, viewBox);
}
