"use client";

import { useCallback, useEffect, useRef } from "react";

export function useDebouncedSketchState(args: {
    setProgress: (updater: any) => void;
    viewTid: string;
    delayMs?: number;
}) {
    const { setProgress, viewTid, delayMs = 900 } = args;

    const timersRef = useRef<Map<string, number>>(new Map());
    const lastHashRef = useRef<Map<string, string>>(new Map());
    const latestRef = useRef<Map<string, any>>(new Map());

    const commitNow = useCallback(
        (topicId: string, sketchCardId: string) => {
            const key = `${topicId}:${sketchCardId}`;
            const s = latestRef.current.get(key);

            setProgress((p: any) => {
                const tp0: any = p.topics?.[topicId] ?? {};
                return {
                    ...p,
                    topics: {
                        ...(p.topics ?? {}),
                        [topicId]: {
                            ...tp0,
                            sketchState: {
                                ...(tp0.sketchState ?? {}),
                                [sketchCardId]: s,
                            },
                        },
                    },
                };
            });
        },
        [setProgress],
    );

    const flushAll = useCallback(() => {
        for (const [key, t] of timersRef.current.entries()) {
            window.clearTimeout(t);
            const parts = key.split(":");
            const topicId = parts[0];
            const sketchCardId = parts.slice(1).join(":");
            if (topicId && sketchCardId) commitNow(topicId, sketchCardId);
        }
        timersRef.current.clear();
    }, [commitNow]);

    const saveSketchDebounced = useCallback(
        (topicId: string, sketchCardId: string, s: any) => {
            const key = `${topicId}:${sketchCardId}`;
            const nextHash = JSON.stringify(s ?? null);

            if (lastHashRef.current.get(key) === nextHash) return;
            lastHashRef.current.set(key, nextHash);

            latestRef.current.set(key, s);

            const prev = timersRef.current.get(key);
            if (prev) window.clearTimeout(prev);

            const t = window.setTimeout(() => commitNow(topicId, sketchCardId), delayMs);
            timersRef.current.set(key, t);
        },
        [commitNow, delayMs],
    );

    // flush when switching topics
    useEffect(() => {
        flushAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewTid]);

    // flush on pagehide
    useEffect(() => {
        const onHide = () => flushAll();
        window.addEventListener("pagehide", onHide);
        return () => window.removeEventListener("pagehide", onHide);
    }, [flushAll]);

    return { saveSketchDebounced, flushAll };
}
