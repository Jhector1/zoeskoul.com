"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ExercisePrompt } from "@/components/practice/kinds/KindHelper";
import { useSpeak } from "./_shared/useSpeak";

type Exercise = {
    title: string;
    prompt: string;
    targetText: string;
    locale?: string;
    hint?: string;
    wordBank?: string[];
    distractors?: string[];
};

type ZoneId = "bank" | "answer";
type Item = { id: string; text: string };

type OverState =
    | { zone: ZoneId; index: number; side: "before" | "after" }
    | null;

type DragRef = {
    pointerId: number;
    id: string;
    from: ZoneId;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    started: boolean;
} | null;

type ShowTargetWhen = "never" | "checked";

function tokenize(s: string) {
    const re = /[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*|\d+|[^\s]/gu;
    return (s.match(re) ?? []).filter(Boolean);
}

function joinNice(tokens: string[]) {
    return tokens
        .join(" ")
        .replace(/\s+([.,!?;:])/g, "$1")
        .replace(/\s+'/g, "'")
        .trim();
}

function normalizeValue(s: string) {
    // normalize external value into the same format joinNice produces
    return joinNice(tokenize(String(s ?? "")));
}

function shuffle<T>(arr: T[]) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function uid(prefix = "t") {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

function removeAt<T>(arr: T[], idx: number) {
    const copy = arr.slice();
    const [item] = copy.splice(idx, 1);
    return { item, next: copy };
}

function insertAt<T>(arr: T[], item: T, at: number) {
    const copy = arr.slice();
    const clamped = Math.max(0, Math.min(at, copy.length));
    copy.splice(clamped, 0, item);
    return copy;
}

function indexOfId(arr: Item[], id: string) {
    return arr.findIndex((x) => x.id === id);
}

// build from a stable seed order (don’t reshuffle on every sync)
function buildFromSeed(seedTexts: string[], valueStr: string) {
    const baseItems: Item[] = seedTexts.map((t) => ({ id: uid("b"), text: t }));
    const answerTexts = tokenize(valueStr);

    const answerItems: Item[] = [];
    let bankItems = baseItems.slice();

    for (const t of answerTexts) {
        const matchIdx = bankItems.findIndex((x) => x.text === t);
        if (matchIdx >= 0) {
            const { item, next } = removeAt(bankItems, matchIdx);
            answerItems.push({ ...item, id: uid("a") });
            bankItems = next;
        } else {
            answerItems.push({ id: uid("a"), text: t });
        }
    }

    return { bankItems, answerItems };
}

function computeSide(clientX: number, el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    const mid = rect.left + rect.width / 2;
    return clientX < mid ? ("before" as const) : ("after" as const);
}

function findDropTarget(clientX: number, clientY: number) {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    if (!el) return null;

    const chip = el.closest("[data-zone][data-idx]") as HTMLElement | null;
    if (chip) {
        const zone = chip.getAttribute("data-zone") as ZoneId | null;
        const idxStr = chip.getAttribute("data-idx");
        if (zone && idxStr != null) {
            const index = Number(idxStr);
            const side = computeSide(clientX, chip);
            return { zone, index, side };
        }
    }

    const zoneEl = el.closest("[data-zone-container]") as HTMLElement | null;
    if (zoneEl) {
        const zone = zoneEl.getAttribute("data-zone-container") as ZoneId | null;
        if (zone) return { zone, index: -1, side: "after" as const };
    }

    return null;
}

export default function ListenBuildExerciseUI({
                                                  exercise,
                                                  value,
                                                  onChangeValue,
                                                  disabled,
                                                  checked,
                                                  ok,
                                                  showTargetWhen = "checked",
                                              }: {
    exercise: Exercise;
    value: string;
    onChangeValue: (v: string) => void;
    disabled: boolean;
    checked: boolean;
    ok: boolean | null;
    showTargetWhen?: ShowTargetWhen;
}) {
    const { speak, ttsStatus } = useSpeak();

    const baseTexts = useMemo(() => {
        const core = exercise.wordBank?.length ? exercise.wordBank : tokenize(exercise.targetText);
        return [...core, ...(exercise.distractors ?? [])].filter(Boolean);
    }, [exercise.wordBank, exercise.targetText, exercise.distractors]);

    const baseKey = useMemo(
        () => `${exercise.targetText}::${baseTexts.join("|")}`,
        [exercise.targetText, baseTexts],
    );

    // stable seed order per exercise instance
    const seedRef = useRef<string[]>([]);

    // ✅ prevents “sync → emit → sync → emit ...”
    const applyingExternalRef = useRef(false);

    const [{ bank, answer }, setState] = useState<{ bank: Item[]; answer: Item[] }>(() => {
        const seed = shuffle(baseTexts);
        seedRef.current = seed;
        const init = buildFromSeed(seed, normalizeValue(value));
        return { bank: init.bankItems, answer: init.answerItems };
    });

    const [over, setOver] = useState<OverState>(null);
    const dragRef = useRef<DragRef>(null);
    const [dragOverlay, setDragOverlay] = useState<{
        text: string;
        x: number;
        y: number;
        active: boolean;
    }>({
        text: "",
        x: 0,
        y: 0,
        active: false,
    });

    // reset when exercise changes
    useEffect(() => {
        const seed = shuffle(baseTexts);
        seedRef.current = seed;

        applyingExternalRef.current = true; // ✅ don't echo back immediately
        const init = buildFromSeed(seed, normalizeValue(value));
        setState({ bank: init.bankItems, answer: init.answerItems });

        setOver(null);
        dragRef.current = null;
        setDragOverlay({ text: "", x: 0, y: 0, active: false });
        // intentionally only keyed by baseKey (avoid running from array identity churn)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [baseKey]);

    // if parent externally changes value (hydrate/reset), sync local state (without reshuffling)
    useEffect(() => {
        const localStr = joinNice(answer.map((x) => x.text));
        const incomingNorm = normalizeValue(value);

        if (incomingNorm === localStr) return;

        const seed = seedRef.current.length ? seedRef.current : shuffle(baseTexts);
        if (!seedRef.current.length) seedRef.current = seed;

        applyingExternalRef.current = true; // ✅ prevents ping-pong
        const next = buildFromSeed(seed, incomingNorm);
        setState({ bank: next.bankItems, answer: next.answerItems });
        setOver(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    // ✅ emit to parent AFTER commit, but skip if we just applied an external sync
    useEffect(() => {
        if (applyingExternalRef.current) {
            applyingExternalRef.current = false;
            return;
        }

        const nextStr = joinNice(answer.map((x) => x.text));
        const curNorm = normalizeValue(value);
        if (nextStr === curNorm) return;

        onChangeValue(nextStr);
    }, [answer, value, onChangeValue]);

    const listen = (speed = 1.0) =>
        void speak(exercise.targetText, {
            speed,
            voice: "marin",
            instructions: "Speak clearly. Slightly slow. Haitian Creole friendly teacher tone.",
        });

    const reset = useCallback(() => {
        const seed = seedRef.current.length ? seedRef.current : shuffle(baseTexts);
        if (!seedRef.current.length) seedRef.current = seed;

        const init = buildFromSeed(seed, "");
        setState({ bank: init.bankItems, answer: [] });
        setOver(null);
    }, [baseTexts]);

    const tapAdd = useCallback(
        (id: string) => {
            if (disabled) return;

            setState((s) => {
                const idx = indexOfId(s.bank, id);
                if (idx < 0) return s;

                const { item, next: nextBank } = removeAt(s.bank, idx);
                const nextAnswer = [...s.answer, { ...item, id: uid("a") }];

                return { bank: nextBank, answer: nextAnswer };
            });
        },
        [disabled],
    );

    const tapRemove = useCallback(
        (id: string) => {
            if (disabled) return;

            setState((s) => {
                const idx = indexOfId(s.answer, id);
                if (idx < 0) return s;

                const { item, next: nextAnswer } = removeAt(s.answer, idx);
                const nextBank = [...s.bank, { ...item, id: uid("b") }];

                return { bank: nextBank, answer: nextAnswer };
            });
        },
        [disabled],
    );

    const commitDrop = useCallback((to: { zone: ZoneId; index: number; side: "before" | "after" }) => {
        const drag = dragRef.current;
        if (!drag) return;

        setState((s) => {
            const fromZone = drag.from;
            const toZone = to.zone;

            const fromArr = fromZone === "bank" ? s.bank : s.answer;
            const toArr = toZone === "bank" ? s.bank : s.answer;

            const fromIdx = indexOfId(fromArr, drag.id);
            if (fromIdx < 0) return s;

            const { item, next: fromNext } = removeAt(fromArr, fromIdx);

            const moved: Item =
                toZone === fromZone ? item : { ...item, id: uid(toZone === "bank" ? "b" : "a") };

            const baseTo = toZone === fromZone ? fromNext : toArr;

            const rawIndex = to.index === -1 ? baseTo.length : to.index + (to.side === "after" ? 1 : 0);
            const adjustedIndex = toZone === fromZone && fromIdx < rawIndex ? rawIndex - 1 : rawIndex;

            const toNext = insertAt(baseTo, moved, adjustedIndex);

            if (fromZone === toZone) {
                return toZone === "bank" ? { bank: toNext, answer: s.answer } : { bank: s.bank, answer: toNext };
            }

            return fromZone === "bank" ? { bank: fromNext, answer: toNext } : { bank: toNext, answer: fromNext };
        });
    }, []);

    function onPointerDownChip(e: React.PointerEvent, zone: ZoneId, item: Item) {
        if (disabled) return;

        const el = e.currentTarget as HTMLElement;
        const rect = el.getBoundingClientRect();
        el.setPointerCapture(e.pointerId);

        dragRef.current = {
            pointerId: e.pointerId,
            id: item.id,
            from: zone,
            startX: e.clientX,
            startY: e.clientY,
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top,
            started: false,
        };

        setDragOverlay({ text: item.text, x: rect.left, y: rect.top, active: false });
    }

    function onPointerMove(e: React.PointerEvent) {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;

        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        const dist = Math.hypot(dx, dy);

        if (!drag.started && dist > 6) {
            drag.started = true;
            setDragOverlay((p) => ({ ...p, active: true }));
        }
        if (!drag.started) return;

        const x = e.clientX - drag.offsetX;
        const y = e.clientY - drag.offsetY;
        setDragOverlay((p) => ({ ...p, x, y, active: true }));

        const target = findDropTarget(e.clientX, e.clientY);
        if (!target) {
            setOver(null);
            return;
        }
        setOver({ zone: target.zone, index: target.index, side: target.side });
    }

    function onPointerUp(e: React.PointerEvent) {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;

        const wasDrag = drag.started;
        const id = drag.id;
        const from = drag.from;

        dragRef.current = null;
        setDragOverlay({ text: "", x: 0, y: 0, active: false });

        if (!wasDrag) {
            if (from === "bank") tapAdd(id);
            else tapRemove(id);
            setOver(null);
            return;
        }

        if (over) commitDrop(over);
        setOver(null);
    }

    function onPointerCancel(e: React.PointerEvent) {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        dragRef.current = null;
        setOver(null);
        setDragOverlay({ text: "", x: 0, y: 0, active: false });
    }

    const statusRing =
        checked && ok === true
            ? "ring-2 ring-emerald-300/40"
            : checked && ok === false
                ? "ring-2 ring-rose-300/40"
                : "";

    const muted = "text-neutral-600 dark:text-white/60";
    const text = "text-neutral-900 dark:text-white/90";

    const btnPrimary = "ui-btn ui-btn-primary";
    const btnSecondary = "ui-btn ui-btn-secondary";

    const chipClass = (isDisabled: boolean) =>
        ["ui-drag-chip", "touch-none", isDisabled ? "ui-drag-chip--disabled" : ""].join(" ");

    const showTarget = showTargetWhen === "checked" ? checked : false;

    return (
        <div
            className={`ui-card p-4 ${statusRing}`}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
        >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <ExercisePrompt exercise={exercise} />
                <div className={`text-xs font-extrabold ${muted}`}>Tap or drag words to build the sentence.</div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
                <button className={btnPrimary} onClick={() => listen(1.0)} disabled={disabled}>
                    🔊 Listen
                </button>
                <button className={btnSecondary} onClick={() => listen(0.9)} disabled={disabled}>
                    🐢 Slow
                </button>
                <button className={btnSecondary} onClick={reset} disabled={disabled}>
                    ↩ Reset
                </button>
            </div>

            {ttsStatus ? <div className={`mt-2 text-xs font-extrabold ${muted}`}>{ttsStatus}</div> : null}

            {showTargetWhen !== "never" ? (
                <div className="mt-3 ui-soft p-3 rounded-2xl">
                    <div className={`text-xs font-extrabold ${muted}`}>Target</div>
                    {showTarget ? (
                        <div className={`mt-1 text-sm font-extrabold ${text}`}>{exercise.targetText}</div>
                    ) : (
                        <div className={`mt-1 text-sm font-extrabold ${muted}`}>Hidden</div>
                    )}
                </div>
            ) : null}

            <div className="mt-4 ui-soft p-3 rounded-2xl" data-zone-container="answer">
                <div className={`text-xs font-extrabold ${muted}`}>Your sentence</div>

                <div className="ui-drag-zone mt-2 flex flex-wrap gap-2">
                    {answer.length ? (
                        answer.map((it, i) => {
                            const isOverThis = over?.zone === "answer" && over?.index === i;
                            const showBefore = isOverThis && over?.side === "before";
                            const showAfter = isOverThis && over?.side === "after";

                            return (
                                <button
                                    key={it.id}
                                    type="button"
                                    className={chipClass(disabled)}
                                    disabled={disabled}
                                    data-zone="answer"
                                    data-idx={i}
                                    onPointerDown={(e) => onPointerDownChip(e, "answer", it)}
                                    title="Tap to remove, drag to reorder"
                                >
                                    {showBefore ? <span className="ui-drag-indicator ui-drag-indicator--before" /> : null}
                                    {showAfter ? <span className="ui-drag-indicator ui-drag-indicator--after" /> : null}
                                    <span className="ui-drag-handle" aria-hidden>
                    ⋮⋮
                  </span>
                                    <span>{it.text}</span>
                                </button>
                            );
                        })
                    ) : (
                        <div className={`text-sm font-extrabold ${muted}`}>Tap or drag words below…</div>
                    )}
                </div>

                <div className={`mt-2 text-xs ${muted}`}>
                    Preview: <span className={`font-extrabold ${text}`}>{joinNice(answer.map((x) => x.text)) || "—"}</span>
                </div>
            </div>

            <div className="mt-4" data-zone-container="bank">
                <div className={`text-xs font-extrabold ${muted}`}>Word bank</div>

                <div className="ui-drag-zone mt-2 flex flex-wrap gap-2">
                    {bank.map((it, i) => {
                        const isOverThis = over?.zone === "bank" && over?.index === i;
                        const showBefore = isOverThis && over?.side === "before";
                        const showAfter = isOverThis && over?.side === "after";

                        return (
                            <button
                                key={it.id}
                                type="button"
                                className={chipClass(disabled)}
                                disabled={disabled}
                                data-zone="bank"
                                data-idx={i}
                                onPointerDown={(e) => onPointerDownChip(e, "bank", it)}
                                title="Tap to add, drag into your sentence"
                            >
                                {showBefore ? <span className="ui-drag-indicator ui-drag-indicator--before" /> : null}
                                {showAfter ? <span className="ui-drag-indicator ui-drag-indicator--after" /> : null}
                                <span className="ui-drag-handle" aria-hidden>
                  ⋮⋮
                </span>
                                <span>{it.text}</span>
                            </button>
                        );
                    })}
                </div>

                <div className={`mt-2 text-[11px] font-extrabold ${muted}`}>
                    Drag bank → answer. Drag within answer to reorder. Tap also works.
                </div>
            </div>

            {dragOverlay.active ? (
                <div className="fixed z-[9999] pointer-events-none" style={{ left: dragOverlay.x, top: dragOverlay.y }}>
                    <div className="ui-drag-chip ui-drag-chip--dragging opacity-90">
            <span className="ui-drag-handle" aria-hidden>
              ⋮⋮
            </span>
                        <span>{dragOverlay.text}</span>
                    </div>
                </div>
            ) : null}
        </div>
    );
}