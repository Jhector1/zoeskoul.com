// src/lib/flow/usePracticeExcuseActions.ts
"use client";

import { useCallback } from "react";
import type { QItem } from "@/components/practice/practiceType";
import { excusePracticeItem, isExcusedPracticeItem } from "@zoeskoul/learner-ui/lib/flow/excuse";

export function usePracticeExcuseActions(args: {
    current: QItem | null;
    idx: number;

    setStack: (updater: (prev: QItem[]) => QItem[]) => void;

    goNext: () => Promise<void>;
    loadNextExercise: () => Promise<void>;

    actionErr: string | null;
    setActionErr: (v: string | null) => void;
}) {
    const {
        current,
        idx,
        setStack,
        goNext,
        loadNextExercise,
        actionErr,
        setActionErr,
    } = args;

    const excuseCurrent = useCallback(
        (reason?: string | null) => {
            if (!current) return;

            setStack((prev) => {
                if (idx < 0 || idx >= prev.length) return prev;
                const q = prev[idx];
                if (!q) return prev;

                // idempotent
                if (isExcusedPracticeItem(q) || (q as any).submitted) return prev;

                const next = prev.slice();
                next[idx] = excusePracticeItem(q, reason ?? null);
                return next;
            });
        },
        [current, idx, setStack],
    );

    const excuseAndNext = useCallback(
        async (reason?: string | null) => {
            // ✅ prevent error banner leaking to next question
            setActionErr(null);

            excuseCurrent(reason ?? actionErr ?? "Unknown error");
            await goNext();
        },
        [excuseCurrent, goNext, actionErr, setActionErr],
    );

    const skipLoadError = useCallback(async () => {
        await loadNextExercise();
    }, [loadNextExercise]);

    return { excuseCurrent, excuseAndNext, skipLoadError };
}
