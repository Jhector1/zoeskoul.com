// src/components/practice/kinds/DragReorderExerciseUI.tsx
"use client";

import React, { useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import MathMarkdown from "@/components/markdown/MathMarkdown";
import {ExercisePrompt} from "@/components/practice/kinds/KindHelper";

type Token = { id: string; text: string };

function move<T>(arr: T[], from: number, to: number) {
  const copy = arr.slice();
  const [item] = copy.splice(from, 1);
  const clamped = Math.max(0, Math.min(to, copy.length));
  copy.splice(clamped, 0, item);
  return copy;
}

type DropSide = "before" | "after" | null;

const LAYOUT_SPRING = {
  type: "spring" as const,
  stiffness: 700,
  damping: 45,
  mass: 0.7,
};

export default function DragReorderExerciseUI({
  exercise,
  tokenIds,
  onChange,
  disabled,
  checked,
  ok,
  reviewCorrectTokenIds = null,
}: {
  exercise: { title: string; prompt: string; tokens: Token[]; hint?: string };
  tokenIds: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
  checked: boolean;
  ok: boolean | null;
  reviewCorrectTokenIds?: string[] | null;
}) {
  const tokensById = useMemo(() => {
    const m = new Map<string, Token>();
    for (const t of exercise.tokens ?? []) m.set(String(t.id), t);
    return m;
  }, [exercise.tokens]);

  const defaultOrder = useMemo(
    () => (exercise.tokens ?? []).map((t) => String(t.id)),
    [exercise.tokens],
  );

  const order = useMemo(() => {
    const ids = Array.isArray(tokenIds) && tokenIds.length ? tokenIds.map(String) : defaultOrder;
    const filtered = ids.filter((id) => tokensById.has(id));
    for (const id of defaultOrder) if (!filtered.includes(id)) filtered.push(id);
    return filtered;
  }, [tokenIds, defaultOrder, tokensById]);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draftOrder, setDraftOrder] = useState<string[] | null>(null);
  const [dropOverId, setDropOverId] = useState<string | null>(null);
  const [dropSide, setDropSide] = useState<DropSide>(null);

  // prevent over-updating draftOrder on every dragover pixel
  const lastPreviewKey = useRef<string>("");

  const renderOrder = draftOrder ?? order;

  const border =
    checked && ok === true
      ? "border-emerald-400/30"
      : checked && ok === false
        ? "border-rose-400/30"
        : "border-neutral-200 dark:border-white/10";

  const bg =
    checked && ok === true
      ? "bg-emerald-300/10"
      : checked && ok === false
        ? "bg-rose-300/10"
        : "bg-white dark:bg-white/[0.03]";

  function apply(next: string[]) {
    if (disabled) return;
    onChange(next);
  }

  function resetDnDState() {
    setDraggingId(null);
    setDraftOrder(null);
    setDropOverId(null);
    setDropSide(null);
    lastPreviewKey.current = "";
  }

  function computeSide(e: React.DragEvent, el: HTMLElement): DropSide {
    const r = el.getBoundingClientRect();
    const midX = r.left + r.width / 2;
    return e.clientX < midX ? "before" : "after";
  }

  function previewMove(overId: string, side: DropSide) {
    if (disabled) return;
    if (!draggingId) return;
    if (overId === draggingId) return;
    if (!side) return;

    const key = `${draggingId}|${overId}|${side}`;
    if (lastPreviewKey.current === key) return;
    lastPreviewKey.current = key;

    const cur = (draftOrder ?? order).slice();
    const from = cur.indexOf(draggingId);
    const overIdx = cur.indexOf(overId);
    if (from < 0 || overIdx < 0) return;

    let to = overIdx + (side === "after" ? 1 : 0);
    if (to > from) to -= 1; // compensate for removal shift

    if (to === from) return;

    setDraftOrder(move(cur, from, to));
  }

  return (
    <div >
      <div className="flex items-start justify-between gap-3">
        {/*<div>*/}
        {/*  <div className="text-sm font-black text-neutral-900 dark:text-white/90">{exercise.title}</div>*/}
        {/*  <MathMarkdown*/}
        {/*    className="mt-2 text-sm text-neutral-700 dark:text-white/80 [&_.katex]:text-neutral-900 dark:[&_.katex]:text-white/90"*/}
        {/*    content={String(exercise.prompt ?? "")}*/}
        {/*  />*/}
        {/*</div>*/}
        <ExercisePrompt exercise={exercise} />

        {checked ? (
          <div
            className={[
              "ui-pill",
              ok === true
                ? "ui-pill--good"
                : "border-rose-300/30 bg-rose-300/10 text-rose-900 dark:text-rose-100",
            ].join(" ")}
          >
            {ok === true ? "Correct" : "Try again"}
          </div>
        ) : null}
      </div>

      <div className="mt-4 ui-soft p-3">
        <div className="text-xs font-extrabold text-neutral-600 dark:text-white/70">
          Drag to reorder (or use arrows)
        </div>

        <LayoutGroup id="drag-reorder">
          <motion.div
            layout
            transition={LAYOUT_SPRING}
            className="ui-drag-zone mt-3 flex flex-wrap gap-2"
            onDragOver={(e) => {
              if (disabled) return;
              e.preventDefault();
            }}
            onDrop={() => {
              if (disabled) return;
              if (draftOrder && draggingId) apply(draftOrder);
              resetDnDState();
            }}
          >
            {renderOrder.map((id, idx) => {
              const t = tokensById.get(id);
              if (!t) return null;

              const isDragging = draggingId === id;
              const isOver = dropOverId === id && !isDragging;

              return (
                <motion.div
                  key={id}
                  layout
                  transition={LAYOUT_SPRING}
                  draggable={!disabled}
                  onDragStart={() => {
                    if (disabled) return;
                    setDraggingId(id);
                    setDraftOrder(order);
                  }}
                  onDragEnd={() => {
                    // if user cancels drag or drops outside
                    resetDnDState();
                  }}
                  onDragOver={(e) => {
                    if (disabled) return;
                    if (!draggingId) return;
                    e.preventDefault();

                    const side = computeSide(e, e.currentTarget as HTMLElement);

                    setDropOverId(id);
                    setDropSide(side);
                    previewMove(id, side);
                  }}
                  onDragLeave={(e) => {
                    const toEl = e.relatedTarget as Node | null;
                    if (toEl && (e.currentTarget as HTMLElement).contains(toEl)) return;
                    if (dropOverId === id) {
                      setDropOverId(null);
                      setDropSide(null);
                      lastPreviewKey.current = "";
                    }
                  }}
                  onDrop={(e) => {
                    if (disabled) return;
                    e.preventDefault();
                    if (draftOrder && draggingId) apply(draftOrder);
                    resetDnDState();
                  }}
                  className={[
                    "ui-drag-chip group",
                    disabled && "ui-drag-chip--disabled",
                    isDragging && "ui-drag-chip--dragging",
                    isOver && "ui-drag-chip--over",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  animate={{
                    opacity: isDragging ? 0.6 : 1,
                    scale: isDragging ? 0.985 : 1,
                  }}
                >
                  <AnimatePresence>
                    {isOver && dropSide ? (
                      <motion.span
                        key={`${id}:${dropSide}`}
                        className={[
                          "ui-drag-indicator",
                          dropSide === "before" ? "ui-drag-indicator--before" : "ui-drag-indicator--after",
                        ].join(" ")}
                        initial={{ opacity: 0, scaleY: 0.6 }}
                        animate={{ opacity: 1, scaleY: 1 }}
                        exit={{ opacity: 0, scaleY: 0.6 }}
                        transition={{ duration: 0.12 }}
                        aria-hidden="true"
                      />
                    ) : null}
                  </AnimatePresence>

                  <span className="ui-drag-handle" aria-hidden="true">
                    ≡
                  </span>
                  <span>{t.text}</span>

                  <div className="ui-drag-actions ml-1 flex items-center gap-1">
                    <button
                      type="button"
                      disabled={disabled || idx === 0}
                      onClick={() => apply(move(order, idx, idx - 1))}
                      className="ui-drag-actionbtn"
                      aria-label="Move left"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      disabled={disabled || idx === order.length - 1}
                      onClick={() => apply(move(order, idx, idx + 1))}
                      className="ui-drag-actionbtn"
                      aria-label="Move right"
                    >
                      →
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </LayoutGroup>
      </div>

      {checked && ok === false && Array.isArray(reviewCorrectTokenIds) ? (
        <div className="mt-3 ui-soft p-3">
          <div className="text-xs font-extrabold text-neutral-600 dark:text-white/70">Correct order</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {reviewCorrectTokenIds
              .map((id) => tokensById.get(String(id)))
              .filter(Boolean)
              .map((t) => (
                <div
                  key={t!.id}
                  className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-extrabold text-neutral-800 dark:border-white/10 dark:bg-white/[0.06] dark:text-white/85"
                >
                  {t!.text}
                </div>
              ))}
          </div>
        </div>
      ) : null}

      {exercise.hint ? (
        <div className="mt-3 text-xs font-extrabold text-neutral-500 dark:text-white/60">
          Hint: <span className="font-bold text-neutral-700 dark:text-white/70">{exercise.hint}</span>
        </div>
      ) : null}
    </div>
  );
}
