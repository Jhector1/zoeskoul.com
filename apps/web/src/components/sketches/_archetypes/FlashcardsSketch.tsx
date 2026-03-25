"use client";

import React, { useMemo } from "react";
import type { SavedSketchState } from "../subjects/types";
import type { FlashcardsSpec } from "../subjects/specTypes";
import { cn, SKETCH_BTN, SKETCH_SOFT } from "@/components/sketches/_shared/sketchUi";

function shuffle<T>(arr: T[]) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

export default function FlashcardsSketch({
                                             spec,
                                             value,
                                             onChange,
                                             readOnly,
                                         }: {
    spec: FlashcardsSpec;
    value: SavedSketchState;
    onChange: (s: SavedSketchState) => void;
    readOnly?: boolean;
}) {
    const data = (value.data ?? {}) as any;
    const order: string[] = Array.isArray(data.order) ? data.order : spec.cards.map((c) => c.id);
    const i = Math.max(0, Math.min(order.length - 1, Number(data.i ?? 0)));
    const flipped = Boolean(data.flipped);

    const card = useMemo(() => {
        const id = order[i];
        return spec.cards.find((c) => c.id === id) ?? spec.cards[i] ?? null;
    }, [order, i, spec.cards]);

    function setState(patch: any) {
        if (readOnly) return;
        onChange({ ...value, updatedAt: new Date().toISOString(), data: { ...data, ...patch } });
    }

    function next() {
        setState({ i: Math.min(order.length - 1, i + 1), flipped: false });
    }
    function prev() {
        setState({ i: Math.max(0, i - 1), flipped: false });
    }
    function flip() {
        setState({ flipped: !flipped });
    }
    function reshuffle() {
        const ids = spec.cards.map((c) => c.id);
        setState({ order: shuffle(ids), i: 0, flipped: false });
    }

    return (
        <div className="grid gap-3">
            <div className={SKETCH_SOFT}>
                <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-extrabold text-neutral-700 dark:text-white/70">
                        Card {i + 1}/{order.length}
                    </div>
                    {spec.shuffle ? (
                        <button className={SKETCH_BTN} type="button" onClick={reshuffle} disabled={readOnly}>
                            Shuffle
                        </button>
                    ) : null}
                </div>
            </div>

            <button
                type="button"
                onClick={flip}
                disabled={readOnly}
                className={cn(
                    "rounded-2xl border p-5 text-left transition",
                    "border-neutral-200 bg-white hover:bg-neutral-50",
                    "dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]",
                )}
            >
                <div className="text-[11px] font-extrabold text-neutral-500 dark:text-white/50">
                    Tap to flip
                </div>
                <div className="mt-2 text-lg font-black text-neutral-900 dark:text-white">
                    {flipped ? card?.back : card?.front}
                </div>
            </button>

            <div className="flex items-center justify-between gap-2">
                <button className={SKETCH_BTN} type="button" onClick={prev} disabled={readOnly || i <= 0}>
                    ← Prev
                </button>
                <button className={SKETCH_BTN} type="button" onClick={next} disabled={readOnly || i >= order.length - 1}>
                    Next →
                </button>
            </div>
        </div>
    );
}
