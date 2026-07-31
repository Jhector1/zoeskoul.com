"use client";

import { useCallback, useEffect, useRef } from "react";
import { useReviewRuntimeStore } from "../runtime/reviewRuntimeStore";

export function useDebouncedSketchState(args: {
    delayMs?: number;
}) {
    const { delayMs = 900 } = args;

    const patchCard = useReviewRuntimeStore((s) => s.patchCard);
    const patchExercise = useReviewRuntimeStore((s) => s.patchExercise);

    const timersRef = useRef<Map<string, number>>(new Map());
    const lastHashRef = useRef<Map<string, string>>(new Map());
    const latestRef = useRef<Map<string, { state: any; isExercise: boolean }>>(new Map());

    const clearTimer = useCallback((key: string) => {
        const timer = timersRef.current.get(key);
        if (timer != null) window.clearTimeout(timer);
        timersRef.current.delete(key);
    }, []);

    const commitNow = useCallback(
        (key: string) => {
            clearTimer(key);

            const record = latestRef.current.get(key);
            if (!record) return;
            const { state, isExercise } = record;

            if (isExercise) {
                patchExercise(key, { sketch: state });
            } else {
                patchCard(key, { sketch: state });
            }
        },
        [clearTimer, patchCard, patchExercise],
    );

    const flushAll = useCallback(() => {
        for (const [key, timer] of timersRef.current.entries()) {
            window.clearTimeout(timer);
            timersRef.current.delete(key);
        }

        for (const key of latestRef.current.keys()) {
            commitNow(key);
        }
    }, [commitNow]);

    const saveSketchDebounced = useCallback(
        (key: string, s: any, isExercise: boolean) => {
            const nextHash = JSON.stringify(s ?? null);

            if (lastHashRef.current.get(key) === nextHash) return;
            lastHashRef.current.set(key, nextHash);
            latestRef.current.set(key, { state: s, isExercise });

            clearTimer(key);
            const timer = window.setTimeout(() => {
                timersRef.current.delete(key);
                commitNow(key);
            }, delayMs);
            timersRef.current.set(key, timer);
        },
        [clearTimer, commitNow, delayMs],
    );

    useEffect(() => {
        const onHide = () => flushAll();
        const onVisibilityChange = () => {
            if (document.visibilityState === "hidden") flushAll();
        };

        window.addEventListener("pagehide", onHide);
        document.addEventListener("visibilitychange", onVisibilityChange);

        return () => {
            flushAll();
            window.removeEventListener("pagehide", onHide);
            document.removeEventListener("visibilitychange", onVisibilityChange);
        };
    }, [flushAll]);

    return { saveSketchDebounced, flushAll };
}
