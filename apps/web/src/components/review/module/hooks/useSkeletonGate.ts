"use client";

import { useEffect, useRef, useState } from "react";

export function useSkeletonGate(opts: {
    ready: boolean;          // when true, content is safe to show
    swapKey: string;         // changes when you want a transition skeleton (topic switch/reset)
    reduceMotion: boolean;
    initialMinMs?: number;   // minimum skeleton time on first load
    swapMs?: number;         // skeleton duration on swap transitions
}) {
    const {
        ready,
        swapKey,
        reduceMotion,
        initialMinMs = 220,
        swapMs = 160,
    } = opts;

    const [show, setShow] = useState(true);
    const didFirstReady = useRef(false);
    const lastSwapKey = useRef<string>("");

    // initial load gating
    useEffect(() => {
        if (!ready) {
            setShow(true);
            didFirstReady.current = false;
            return;
        }

        if (!didFirstReady.current) {
            const ms = reduceMotion ? 0 : initialMinMs;
            const t = window.setTimeout(() => {
                setShow(false);
                didFirstReady.current = true;
                lastSwapKey.current = swapKey;
            }, ms);

            return () => window.clearTimeout(t);
        }
    }, [ready, reduceMotion, initialMinMs, swapKey]);

    // transitions (topic change / reset)
    useEffect(() => {
        if (!ready) return;
        if (!didFirstReady.current) return;

        if (lastSwapKey.current === "") lastSwapKey.current = swapKey;
        if (swapKey === lastSwapKey.current) return;

        lastSwapKey.current = swapKey;

        if (reduceMotion) return;

        setShow(true);
        const t = window.setTimeout(() => setShow(false), swapMs);
        return () => window.clearTimeout(t);
    }, [ready, swapKey, reduceMotion, swapMs]);

    return show;
}