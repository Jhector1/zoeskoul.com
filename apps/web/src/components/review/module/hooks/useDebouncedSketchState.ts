"use client";

import { useCallback, useEffect, useRef } from "react";

function makeSketchKey(topicId: string, sketchCardId: string) {
    return JSON.stringify([topicId, sketchCardId]);
}

function parseSketchKey(key: string): [string, string] | null {
    try {
        const parsed = JSON.parse(key);
        if (Array.isArray(parsed) && typeof parsed[0] === "string" && typeof parsed[1] === "string") {
            return [parsed[0], parsed[1]];
        }
    } catch {}
    return null;
}

export function useDebouncedSketchState(args: {
    setProgress: (updater: any) => void;
    viewTid: string;
    delayMs?: number;
}) {
    const { setProgress, viewTid, delayMs = 900 } = args;

    const timersRef = useRef<Map<string, number>>(new Map());
    const lastHashRef = useRef<Map<string, string>>(new Map());
    const latestRef = useRef<Map<string, any>>(new Map());

    const clearTimer = useCallback((key: string) => {
        const timer = timersRef.current.get(key);
        if (timer != null) window.clearTimeout(timer);
        timersRef.current.delete(key);
    }, []);

    const commitNow = useCallback(
        (topicId: string, sketchCardId: string) => {
            const key = makeSketchKey(topicId, sketchCardId);
            clearTimer(key);

            if (!latestRef.current.has(key)) return;
            const s = latestRef.current.get(key);
            const nextHash = JSON.stringify(s ?? null);

            setProgress((p: any) => {
                const tp0: any = p?.topics?.[topicId] ?? {};
                const sketchState0: any = tp0?.sketchState ?? {};
                const prevHash = JSON.stringify(sketchState0?.[sketchCardId] ?? null);

                if (prevHash === nextHash) return p;

                return {
                    ...p,
                    topics: {
                        ...(p?.topics ?? {}),
                        [topicId]: {
                            ...tp0,
                            sketchState: {
                                ...sketchState0,
                                [sketchCardId]: s,
                            },
                        },
                    },
                };
            });
        },
        [clearTimer, setProgress],
    );

    const flushAll = useCallback(() => {
        for (const [key, timer] of timersRef.current.entries()) {
            window.clearTimeout(timer);
            timersRef.current.delete(key);
        }

        for (const key of latestRef.current.keys()) {
            const parsed = parseSketchKey(key);
            if (!parsed) continue;
            commitNow(parsed[0], parsed[1]);
        }
    }, [commitNow]);

    const saveSketchDebounced = useCallback(
        (topicId: string, sketchCardId: string, s: any) => {
            const key = makeSketchKey(topicId, sketchCardId);
            const nextHash = JSON.stringify(s ?? null);

            if (lastHashRef.current.get(key) === nextHash) return;
            lastHashRef.current.set(key, nextHash);
            latestRef.current.set(key, s);

            clearTimer(key);
            const timer = window.setTimeout(() => {
                timersRef.current.delete(key);
                commitNow(topicId, sketchCardId);
            }, delayMs);
            timersRef.current.set(key, timer);
        },
        [clearTimer, commitNow, delayMs],
    );

    // Flush pending sketch updates before switching topics.
    useEffect(() => {
        flushAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewTid]);

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
