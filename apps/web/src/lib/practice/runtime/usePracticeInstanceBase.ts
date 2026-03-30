"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Exercise, Difficulty } from "@/lib/practice/types";
import type { VectorPadState } from "@/components/vectorpad/types";
import type { QItem } from "@/lib/practice/uiTypes";
import {
    fetchResolvedPracticeItem,
    revealPracticeItem,
    submitPracticeItem,
} from "@/lib/practice/runtime";
import { cloneVec } from "@/lib/practice/uiHelpers";
import { useTaggedT } from "@/i18n/tagged";

export type PracticeInstanceLoadArgs = {
    subject?: string;
    module?: string;
    section?: string;
    topic?: string;
    difficulty?: Difficulty;
    allowReveal?: boolean;
    sessionId?: string;
    preferKind?: string;
    salt?: string;

    preferPurpose?: string;
    purposePolicy?: string;
    exerciseKey?: string;
    seedPolicy?: string;
};

function stableJson(x: any) {
    try {
        return JSON.stringify(x ?? {});
    } catch {
        return "{}";
    }
}

export function usePracticeInstanceBase(args: {
    load: PracticeInstanceLoadArgs;
    maxAttempts: number;
    padRef?: React.MutableRefObject<VectorPadState | null>;
}) {
    const { load, maxAttempts, padRef } = args;

    const [busy, setBusy] = useState(false);
    const [submitBusy, setSubmitBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [item, setItem] = useState<QItem | null>(null);
    const [exercise, setExercise] = useState<Exercise | null>(null);

    const lockRef = useRef(false);
    const abortRef = useRef<AbortController | null>(null);

    const loadSig = useMemo(() => stableJson(load), [load]);

    const tt = useTaggedT();
    const rawKeyRef = useRef<(key: string) => string>((key) => key);
    const resolveTextRef = useRef<(value: string) => string>((value) => value);

    rawKeyRef.current = (key: string) => tt.raw(key, key);
    resolveTextRef.current = (value: string) => tt.resolve(value, value);

    const update = useCallback((patch: Partial<QItem>) => {
        setItem((prev) => (prev ? { ...prev, ...patch } : prev));
    }, []);

    const loadNew = useCallback(async () => {
        if (lockRef.current) return;
        lockRef.current = true;

        abortRef.current?.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;

        setBusy(true);
        setError(null);

        try {
            const loaded = await fetchResolvedPracticeItem({
                request: load,
                signal: ctrl.signal,
                resolvers: {
                    raw: (k) => rawKeyRef.current(k),
                    resolveText: (value) => resolveTextRef.current(value),
                },
            });

            setExercise(loaded.exercise);
            setItem(loaded.item);

            if (padRef?.current) {
                padRef.current.a = cloneVec((loaded.item as any).dragA) as any;
                padRef.current.b = cloneVec((loaded.item as any).dragB) as any;
            }
        } catch (e: any) {
            if (e?.name !== "AbortError") {
                setError(e?.message ?? "Failed to load.");
            }
        } finally {
            setBusy(false);
            lockRef.current = false;
        }
    }, [loadSig, padRef]);

    useEffect(() => {
        void loadNew();
        return () => abortRef.current?.abort();
    }, [loadNew]);

    const submit = useCallback(async () => {
        if (!item || !exercise) return;
        if (submitBusy) return;
        if (item.submitted) return;
        if ((item.attempts ?? 0) >= maxAttempts) return;

        setSubmitBusy(true);
        setError(null);

        try {
            const submitted = await submitPracticeItem({
                item,
                exercise,
                padRef: padRef as any,
                maxAttempts,
                isLockedRun: true,
            });

            update({
                ...(submitted.statePatch ?? {}),
                result: submitted.data as any,
                attempts: submitted.used,
                submitted: submitted.finalized,
                revealed: false,
            });
        } catch (e: any) {
            const msg = String(e?.message ?? "");
            if (msg.toLowerCase().includes("already finalized")) {
                update({ submitted: true });
                return;
            }
            setError(e?.message ?? "Failed to submit.");
        } finally {
            setSubmitBusy(false);
        }
    }, [item, exercise, submitBusy, maxAttempts, padRef, update]);

    const reveal = useCallback(async () => {
        if (!item) return;
        if (busy) return;

        setBusy(true);
        setError(null);

        try {
            const revealed = await revealPracticeItem(item);

            update({
                result: revealed.data as any,
                revealed: true,
                submitted: Boolean((revealed.data as any)?.finalized),
                ...(revealed.dragA ? { dragA: revealed.dragA } : {}),
                ...(revealed.dragB ? { dragB: revealed.dragB } : {}),
            });

            if (padRef?.current) {
                if (revealed.dragA) padRef.current.a = cloneVec(revealed.dragA) as any;
                if (revealed.dragB) padRef.current.b = cloneVec(revealed.dragB) as any;
            }
        } catch (e: any) {
            setError(e?.message ?? "Failed to reveal.");
        } finally {
            setBusy(false);
        }
    }, [item, busy, padRef, update]);

    return {
        busy,
        submitBusy,
        error,
        exercise,
        item,
        update,
        loadNew,
        submit,
        reveal,
    };
}