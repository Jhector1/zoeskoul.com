"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Circle,
  Eraser,
  MousePointer2,
  MoveUpRight,
  Pencil,
  Redo2,
  Square,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { useToolDoc, type ToolDocKey } from "../hooks/useToolDoc";
import { useElementSize } from "../hooks/useElementSize";
import { clientPointToBoardPoint } from "../board/coordinates";
import { getBoardTextEditorRect, getBoardViewport } from "../board/layout";
import {
  boardElementBounds,
  boardTextBounds,
  emptyBoardDocument,
  findTopBoardElement,
  parseBoardDocument,
  resizeBoardElement,
  serializeBoardDocument,
  translateBoardElement,
  type BoardResizeHandle,
} from "../board/document";
import type {
  BoardDocument,
  BoardElement,
  BoardPoint,
  BoardTool,
} from "../board/types";

const DEFAULT_COLOR = "#0f766e";
const DEFAULT_STROKE_WIDTH = 4;

const TOOL_BUTTONS = [
  { tool: "select", Icon: MousePointer2, labelKey: "select" },
  { tool: "pen", Icon: Pencil, labelKey: "pen" },
  { tool: "text", Icon: Type, labelKey: "text" },
  { tool: "rectangle", Icon: Square, labelKey: "rectangle" },
  { tool: "ellipse", Icon: Circle, labelKey: "ellipse" },
  { tool: "arrow", Icon: MoveUpRight, labelKey: "arrow" },
  { tool: "eraser", Icon: Eraser, labelKey: "eraser" },
] as const;

type Interaction =
  | { type: "draw"; elementId: string; start: BoardPoint }
  | { type: "move"; elementId: string; start: BoardPoint; original: BoardElement }
  | { type: "resize"; elementId: string; handle: BoardResizeHandle; original: BoardElement }
  | null;

type TextDraft = {
  elementId?: string;
  x: number;
  y: number;
  value: string;
};

export type BoardToolPaneProps = {
  boardKey: ToolDocKey;
  readOnly?: boolean;
  documentEndpoint?: string;
  documentRequestKey?: Record<string, string>;
  documentRefreshMs?: number;
};

function cloneDocument(document: BoardDocument): BoardDocument {
  return JSON.parse(JSON.stringify(document)) as BoardDocument;
}

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `board-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeBox(start: BoardPoint, current: BoardPoint) {
  return {
    x: Math.min(start.x, current.x),
    y: Math.min(start.y, current.y),
    width: Math.abs(current.x - start.x),
    height: Math.abs(current.y - start.y),
  };
}

const BOX_RESIZE_HANDLES = [
  { handle: "north-west", cursor: "nwse-resize" },
  { handle: "north-east", cursor: "nesw-resize" },
  { handle: "south-east", cursor: "nwse-resize" },
  { handle: "south-west", cursor: "nesw-resize" },
] as const;

function selectionBounds(element: BoardElement) {
  const bounds = boardElementBounds(element);
  return {
    x: bounds.x - 8,
    y: bounds.y - 8,
    width: Math.max(2, bounds.width) + 16,
    height: Math.max(2, bounds.height) + 16,
  };
}

function handlePoint(
  bounds: { x: number; y: number; width: number; height: number },
  handle: Exclude<BoardResizeHandle, "arrow-start" | "arrow-end">,
): BoardPoint {
  if (handle === "north-west") return { x: bounds.x, y: bounds.y };
  if (handle === "north-east") return { x: bounds.x + bounds.width, y: bounds.y };
  if (handle === "south-west") return { x: bounds.x, y: bounds.y + bounds.height };
  return { x: bounds.x + bounds.width, y: bounds.y + bounds.height };
}

function BoardElementView({ element }: { element: BoardElement }) {
  if (element.type === "stroke") {
    return (
      <polyline
        points={element.points.map((point) => `${point.x},${point.y}`).join(" ")}
        fill="none"
        stroke={element.color}
        strokeWidth={element.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }

  if (element.type === "text") {
    const bounds = boardTextBounds(element);
    return (
      <text
        x={element.x}
        y={element.y}
        fill={element.color}
        fontSize={element.fontSize}
        fontWeight={600}
      >
        {bounds.lines.map((line, index) => (
          <tspan
            key={`${element.id}-${index}`}
            x={element.x}
            dy={index === 0 ? 0 : bounds.lineHeight}
          >
            {line || "\u00a0"}
          </tspan>
        ))}
      </text>
    );
  }

  if (element.type === "rectangle") {
    const box = normalizeBox(
      { x: element.x, y: element.y },
      { x: element.x + element.width, y: element.y + element.height },
    );
    return (
      <rect
        {...box}
        fill="transparent"
        stroke={element.color}
        strokeWidth={element.strokeWidth}
        rx={10}
      />
    );
  }

  if (element.type === "ellipse") {
    const box = normalizeBox(
      { x: element.x, y: element.y },
      { x: element.x + element.width, y: element.y + element.height },
    );
    return (
      <ellipse
        cx={box.x + box.width / 2}
        cy={box.y + box.height / 2}
        rx={box.width / 2}
        ry={box.height / 2}
        fill="transparent"
        stroke={element.color}
        strokeWidth={element.strokeWidth}
      />
    );
  }

  if (element.type === "arrow") {
    return (
      <line
        x1={element.start.x}
        y1={element.start.y}
        x2={element.end.x}
        y2={element.end.y}
        stroke={element.color}
        strokeWidth={element.strokeWidth}
        strokeLinecap="round"
        markerEnd="url(#board-arrow-head)"
      />
    );
  }

  return null;
}

export default function BoardToolPane({
  boardKey,
  readOnly = false,
  documentEndpoint,
  documentRequestKey,
  documentRefreshMs,
}: BoardToolPaneProps) {
  const t = useTranslations("ide.tools.board");
  const { body, setBody, state, hydrated } = useToolDoc(boardKey, {
    format: "plain",
    debounceMs: 500,
    endpoint: documentEndpoint,
    requestKey: documentRequestKey,
    refreshMs: documentRefreshMs,
  });
  const [document, setDocument] = useState<BoardDocument>(() => emptyBoardDocument());
  const [tool, setTool] = useState<BoardTool>("select");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [strokeWidth, setStrokeWidth] = useState(DEFAULT_STROKE_WIDTH);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
  const [interaction, setInteraction] = useState<Interaction>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const hydratedRef = useRef(false);
  const keyRef = useRef("");
  const historyRef = useRef<BoardDocument[]>([]);
  const futureRef = useRef<BoardDocument[]>([]);
  const textInputRef = useRef<HTMLTextAreaElement | null>(null);
  const { ref: boardSurfaceRef, size: boardSurfaceSize } = useElementSize<HTMLDivElement>();
  const boardViewport = useMemo(
    () => getBoardViewport({ width: boardSurfaceSize.w, height: boardSurfaceSize.h }),
    [boardSurfaceSize.h, boardSurfaceSize.w],
  );
  const boardScale = Math.max(
    0.01,
    Math.min(
      boardSurfaceSize.w / boardViewport.width || 1,
      boardSurfaceSize.h / boardViewport.height || 1,
    ),
  );

  const keyString = useMemo(
    () => [boardKey.subjectSlug, boardKey.moduleId, boardKey.locale, boardKey.toolId, boardKey.scopeKey].join("::"),
    [boardKey],
  );

  useEffect(() => {
    if (keyRef.current === keyString) return;
    keyRef.current = keyString;
    hydratedRef.current = false;
    historyRef.current = [];
    futureRef.current = [];
    setHistoryVersion((value) => value + 1);
    setSelectedId(null);
    setTextDraft(null);
    setInteraction(null);
  }, [keyString]);

  useEffect(() => {
    if (!hydrated || hydratedRef.current) return;
    setDocument(parseBoardDocument(body));
    hydratedRef.current = true;
  }, [body, hydrated]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const serialized = serializeBoardDocument(document);
    if (serialized !== body) setBody(serialized);
  }, [body, document, setBody]);

  useEffect(() => {
    if (!textDraft) return;
    const frame = window.requestAnimationFrame(() => {
      textInputRef.current?.focus();
      const length = textInputRef.current?.value.length ?? 0;
      textInputRef.current?.setSelectionRange(length, length);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [textDraft?.elementId, textDraft?.x, textDraft?.y]);

  const checkpoint = useCallback(() => {
    historyRef.current = [...historyRef.current.slice(-49), cloneDocument(document)];
    futureRef.current = [];
    setHistoryVersion((value) => value + 1);
  }, [document]);

  const undo = useCallback(() => {
    const previous = historyRef.current.at(-1);
    if (!previous) return;
    historyRef.current = historyRef.current.slice(0, -1);
    futureRef.current = [cloneDocument(document), ...futureRef.current.slice(0, 49)];
    setDocument(cloneDocument(previous));
    setSelectedId(null);
    setHistoryVersion((value) => value + 1);
  }, [document]);

  const redo = useCallback(() => {
    const next = futureRef.current[0];
    if (!next) return;
    futureRef.current = futureRef.current.slice(1);
    historyRef.current = [...historyRef.current.slice(-49), cloneDocument(document)];
    setDocument(cloneDocument(next));
    setSelectedId(null);
    setHistoryVersion((value) => value + 1);
  }, [document]);

  const removeElement = useCallback((id: string) => {
    checkpoint();
    setDocument((current) => ({ ...current, elements: current.elements.filter((element) => element.id !== id) }));
    setSelectedId((current) => (current === id ? null : current));
  }, [checkpoint]);

  const beginTextEdit = useCallback((element: Extract<BoardElement, { type: "text" }>) => {
    setSelectedId(element.id);
    setColor(element.color);
    setStrokeWidth(element.strokeWidth);
    setTextDraft({ elementId: element.id, x: element.x, y: element.y, value: element.text });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (readOnly || textDraft) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, [contenteditable='true']")) return;
      if ((event.key === "Backspace" || event.key === "Delete") && selectedId) {
        event.preventDefault();
        removeElement(selectedId);
      }
      if (event.key === "Enter" && selectedId) {
        const selectedText = document.elements.find(
          (element): element is Extract<BoardElement, { type: "text" }> =>
            element.id === selectedId && element.type === "text",
        );
        if (selectedText) {
          event.preventDefault();
          beginTextEdit(selectedText);
        }
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [beginTextEdit, document.elements, readOnly, redo, removeElement, selectedId, textDraft, undo]);

  const eventPoints = useCallback((event: React.PointerEvent<SVGSVGElement>): BoardPoint[] => {
    const nativeEvent = event.nativeEvent;
    const samples = typeof nativeEvent.getCoalescedEvents === "function"
      ? nativeEvent.getCoalescedEvents()
      : [nativeEvent];
    const source = samples.length > 0 ? samples : [nativeEvent];

    return source.map((sample) =>
      clientPointToBoardPoint(event.currentTarget, sample.clientX, sample.clientY),
    );
  }, []);

  const eventPoint = useCallback((event: React.PointerEvent<SVGSVGElement>): BoardPoint => {
    const points = eventPoints(event);
    return points[points.length - 1];
  }, [eventPoints]);

  const onPointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    const target = eventPoint(event);
    const rawHandle = (event.target as SVGElement | null)?.getAttribute("data-board-resize-handle");
    const selectedForHandle = selectedId
      ? document.elements.find((element) => element.id === selectedId) ?? null
      : null;

    if (!readOnly && tool === "select" && rawHandle && selectedForHandle) {
      checkpoint();
      setInteraction({
        type: "resize",
        elementId: selectedForHandle.id,
        handle: rawHandle as BoardResizeHandle,
        original: cloneDocument({ version: 1, elements: [selectedForHandle] }).elements[0],
      });
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    const hit = findTopBoardElement(document.elements, target);

    if (readOnly) {
      setSelectedId(hit?.id ?? null);
      return;
    }

    if (tool === "text") {
      event.preventDefault();
      if (hit?.type === "text") {
        beginTextEdit(hit);
      } else {
        setSelectedId(null);
        setTextDraft({ x: target.x, y: target.y, value: "" });
      }
      return;
    }

    if (tool === "eraser") {
      if (hit) removeElement(hit.id);
      return;
    }

    if (tool === "select") {
      setSelectedId(hit?.id ?? null);
      if (hit) {
        setColor(hit.color);
        setStrokeWidth(hit.strokeWidth);
        checkpoint();
        setInteraction({
          type: "move",
          elementId: hit.id,
          start: target,
          original: cloneDocument({ version: 1, elements: [hit] }).elements[0],
        });
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      return;
    }

    checkpoint();
    const id = makeId();
    let element: BoardElement;
    if (tool === "pen") {
      element = { id, type: "stroke", color, strokeWidth, points: [target, target] };
    } else if (tool === "arrow") {
      element = { id, type: "arrow", color, strokeWidth, start: target, end: target };
    } else {
      element = { id, type: tool, color, strokeWidth, x: target.x, y: target.y, width: 0, height: 0 };
    }
    setDocument((current) => ({ ...current, elements: [...current.elements, element] }));
    setSelectedId(id);
    setInteraction({ type: "draw", elementId: id, start: target });
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [beginTextEdit, checkpoint, color, document.elements, eventPoint, readOnly, removeElement, selectedId, strokeWidth, tool]);

  const onPointerMove = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (!interaction || readOnly) return;
    const pointerPoints = eventPoints(event);
    const currentPoint = pointerPoints[pointerPoints.length - 1];
    setDocument((current) => ({
      ...current,
      elements: current.elements.map((element) => {
        if (element.id !== interaction.elementId) return element;
        if (interaction.type === "move") {
          return translateBoardElement(
            interaction.original,
            currentPoint.x - interaction.start.x,
            currentPoint.y - interaction.start.y,
          );
        }
        if (interaction.type === "resize") {
          return resizeBoardElement(interaction.original, interaction.handle, currentPoint);
        }
        if (element.type === "stroke") {
          const appended = [...element.points];
          for (const point of pointerPoints) {
            const last = appended[appended.length - 1];
            if (Math.hypot(point.x - last.x, point.y - last.y) >= 2) appended.push(point);
          }
          return appended.length === element.points.length ? element : { ...element, points: appended };
        }
        if (element.type === "arrow") return { ...element, end: currentPoint };
        if (element.type === "rectangle" || element.type === "ellipse") {
          return {
            ...element,
            x: interaction.start.x,
            y: interaction.start.y,
            width: currentPoint.x - interaction.start.x,
            height: currentPoint.y - interaction.start.y,
          };
        }
        return element;
      }),
    }));
  }, [eventPoints, interaction, readOnly]);

  const finishInteraction = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (interaction?.type === "draw" && tool !== "pen") setTool("select");
    setInteraction(null);
  }, [interaction, tool]);

  const commitText = useCallback(() => {
    if (!textDraft) return;
    const value = textDraft.value.trim();
    if (!value) {
      setTextDraft(null);
      return;
    }
    checkpoint();
    if (textDraft.elementId) {
      setDocument((current) => ({
        ...current,
        elements: current.elements.map((element) =>
          element.id === textDraft.elementId && element.type === "text"
            ? { ...element, text: value, color }
            : element,
        ),
      }));
    } else {
      const id = makeId();
      setDocument((current) => ({
        ...current,
        elements: [
          ...current.elements,
          { id, type: "text", color, strokeWidth, x: textDraft.x, y: textDraft.y, text: value, fontSize: 30 },
        ],
      }));
      setSelectedId(id);
    }
    setTextDraft(null);
    setTool("select");
  }, [checkpoint, color, strokeWidth, textDraft]);

  const selected = document.elements.find((element) => element.id === selectedId) ?? null;

  const updateSelectedAppearance = useCallback((patch: { color?: string; strokeWidth?: number }) => {
    if (!selectedId || readOnly) return;
    checkpoint();
    setDocument((current) => ({
      ...current,
      elements: current.elements.map((element) =>
        element.id === selectedId ? { ...element, ...patch } : element,
      ),
    }));
  }, [checkpoint, readOnly, selectedId]);

  const onDoubleClick = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
    if (readOnly) return;
    const target = clientPointToBoardPoint(event.currentTarget, event.clientX, event.clientY);
    const hit = findTopBoardElement(document.elements, target);
    if (hit?.type === "text") {
      event.preventDefault();
      beginTextEdit(hit);
    }
  }, [beginTextEdit, document.elements, readOnly]);

  const canUndo = historyRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;
  void historyVersion;

  const textEditorRect = textDraft
    ? getBoardTextEditorRect(
        { x: textDraft.x, y: textDraft.y },
        { width: boardSurfaceSize.w, height: boardSurfaceSize.h },
        { viewport: boardViewport },
      )
    : null;

  const selectionStrokeWidth = 2 / boardScale;
  const selectionDash = `${8 / boardScale} ${6 / boardScale}`;
  const selectionHandleRadius = 7 / boardScale;

  const statusLabel = state === "loading"
    ? t("loading")
    : state === "saving"
      ? t("saving")
      : state === "error"
        ? t("saveFailed")
        : t("saved");

  return (
    <div className="flex h-full min-h-0 flex-col bg-[rgb(var(--ui-surface))]">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[rgb(var(--ui-border)/0.7)] px-2 py-2">
        {TOOL_BUTTONS.map(({ tool: item, Icon, labelKey }) => (
          <button
            key={item}
            type="button"
            className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition ${
              tool === item
                ? "border-emerald-500 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                : "border-transparent text-[rgb(var(--ui-text-muted))] hover:border-[rgb(var(--ui-border))] hover:bg-[rgb(var(--ui-surface-muted))]"
            }`}
            title={t(labelKey)}
            aria-label={t(labelKey)}
            aria-pressed={tool === item}
            disabled={readOnly && item !== "select"}
            onClick={() => {
              setTool(item);
              setTextDraft(null);
            }}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}

        <div className="mx-1 h-6 w-px bg-[rgb(var(--ui-border))]" />
        <label className="relative h-8 w-8 overflow-hidden rounded-full border border-[rgb(var(--ui-border))]" title={t("color")}>
          <input
            type="color"
            value={color}
            disabled={readOnly}
            onChange={(event) => {
              const nextColor = event.target.value;
              setColor(nextColor);
              if (selected) updateSelectedAppearance({ color: nextColor });
            }}
            className="absolute -inset-2 h-12 w-12 cursor-pointer border-0 bg-transparent p-0"
            aria-label={t("color")}
          />
        </label>
        <select
          value={strokeWidth}
          disabled={readOnly}
          onChange={(event) => {
            const nextStrokeWidth = Number(event.target.value);
            setStrokeWidth(nextStrokeWidth);
            if (selected) updateSelectedAppearance({ strokeWidth: nextStrokeWidth });
          }}
          className="h-9 rounded-lg border border-[rgb(var(--ui-border))] bg-[rgb(var(--ui-surface))] px-2 text-xs"
          aria-label={t("strokeWidth")}
        >
          <option value={2}>2 px</option>
          <option value={4}>4 px</option>
          <option value={7}>7 px</option>
          <option value={12}>12 px</option>
        </select>

        <div className="ml-auto flex items-center gap-1">
          <button type="button" className="ui-btn ui-btn-ghost h-9 w-9 p-0" onClick={undo} disabled={readOnly || !canUndo} title={t("undo")} aria-label={t("undo")}>
            <Undo2 className="h-4 w-4" />
          </button>
          <button type="button" className="ui-btn ui-btn-ghost h-9 w-9 p-0" onClick={redo} disabled={readOnly || !canRedo} title={t("redo")} aria-label={t("redo")}>
            <Redo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-ghost h-9 w-9 p-0"
            disabled={readOnly || document.elements.length === 0}
            onClick={() => {
              checkpoint();
              setDocument(emptyBoardDocument());
              setSelectedId(null);
            }}
            title={t("clear")}
            aria-label={t("clear")}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-slate-100 p-2 dark:bg-slate-950">
        <div
          ref={boardSurfaceRef}
          className="relative h-full min-h-[240px] w-full overflow-hidden rounded-xl border border-slate-300 bg-white shadow-inner dark:border-white/10 dark:bg-slate-900"
        >
          <svg
            viewBox={`${boardViewport.x} ${boardViewport.y} ${boardViewport.width} ${boardViewport.height}`}
            preserveAspectRatio="xMinYMin meet"
            className={`absolute inset-0 h-full w-full touch-none ${
              tool === "pen"
                ? "cursor-crosshair"
                : tool === "eraser"
                  ? "cursor-cell"
                  : tool === "text"
                    ? "cursor-text"
                    : tool === "select"
                      ? "cursor-default"
                      : "cursor-crosshair"
            }`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finishInteraction}
            onPointerCancel={finishInteraction}
            onLostPointerCapture={finishInteraction}
            onDoubleClick={onDoubleClick}
            role="application"
            aria-label={t("canvas")}
          >
            <defs>
              <pattern id="board-grid" width="32" height="32" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="1.2" fill="currentColor" className="text-slate-300 dark:text-slate-700" />
              </pattern>
              <marker id="board-arrow-head" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L0,6 L9,3 z" fill="context-stroke" />
              </marker>
            </defs>
            <rect
              x={boardViewport.x}
              y={boardViewport.y}
              width={boardViewport.width}
              height={boardViewport.height}
              fill="url(#board-grid)"
            />
            {document.elements.map((element) => <BoardElementView key={element.id} element={element} />)}
            {selected && tool === "select" ? (() => {
              if (selected.type === "arrow") {
                return (
                  <g>
                    <line
                      x1={selected.start.x}
                      y1={selected.start.y}
                      x2={selected.end.x}
                      y2={selected.end.y}
                      stroke="#10b981"
                      strokeWidth={selectionStrokeWidth}
                      strokeDasharray={selectionDash}
                      pointerEvents="none"
                    />
                    {([
                      ["arrow-start", selected.start, "move"],
                      ["arrow-end", selected.end, "move"],
                    ] as const).map(([handle, point, cursor]) => (
                      <circle
                        key={handle}
                        cx={point.x}
                        cy={point.y}
                        r={selectionHandleRadius}
                        fill="white"
                        stroke="#10b981"
                        strokeWidth={selectionStrokeWidth}
                        data-board-resize-handle={handle}
                        style={{ cursor }}
                      />
                    ))}
                  </g>
                );
              }

              const elementBounds = boardElementBounds(selected);
              const bounds = selectionBounds(selected);
              const handles = selected.type === "text"
                ? BOX_RESIZE_HANDLES.filter(({ handle }) => handle === "south-east")
                : BOX_RESIZE_HANDLES;
              return (
                <g>
                  <rect
                    {...bounds}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth={selectionStrokeWidth}
                    strokeDasharray={selectionDash}
                    pointerEvents="none"
                  />
                  {handles.map(({ handle, cursor }) => {
                    const point = handlePoint(elementBounds, handle);
                    return (
                      <circle
                        key={handle}
                        cx={point.x}
                        cy={point.y}
                        r={selectionHandleRadius}
                        fill="white"
                        stroke="#10b981"
                        strokeWidth={selectionStrokeWidth}
                        data-board-resize-handle={handle}
                        style={{ cursor }}
                      />
                    );
                  })}
                </g>
              );
            })() : null}
          </svg>

          {textDraft && textEditorRect ? (
            <div
              className="absolute z-20"
              style={{
                left: textEditorRect.left,
                top: textEditorRect.top,
                width: textEditorRect.width,
                height: textEditorRect.height,
              }}
            >
              <textarea
                ref={textInputRef}
                value={textDraft.value}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => setTextDraft((current) => current ? { ...current, value: event.target.value } : current)}
                onBlur={commitText}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setTextDraft(null);
                  } else if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    commitText();
                  }
                }}
                className="h-full w-full resize-none rounded-lg border-2 border-emerald-500 bg-white/95 px-3 py-2 leading-tight text-slate-950 shadow-xl outline-none ring-2 ring-emerald-500/15 placeholder:text-slate-400"
                style={{ fontSize: textEditorRect.fontSize }}
                placeholder={t("textPlaceholder")}
                aria-label={t("textPlaceholder")}
                spellCheck={false}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-[rgb(var(--ui-border)/0.7)] px-3 py-1.5 text-[11px] text-[rgb(var(--ui-text-muted))]">
        <span>{readOnly ? t("readOnly") : t("hint")}</span>
        <span aria-live="polite">{statusLabel}</span>
      </div>
    </div>
  );
}
