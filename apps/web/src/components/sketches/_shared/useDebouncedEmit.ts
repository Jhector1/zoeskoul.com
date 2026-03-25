"use client";

import * as React from "react";

export function useDebouncedEmit<T>(
    value: T,
    emit: (v: T) => void,
    opts?: { delayMs?: number; enabled?: boolean },
) {
    const delayMs = opts?.delayMs ?? 350;
    const enabled = opts?.enabled ?? true;

    const lastRef = React.useRef<T>(value);
    const tRef = React.useRef<number | null>(null);

    React.useEffect(() => {
        if (!enabled) return;
        lastRef.current = value;

        if (tRef.current) window.clearTimeout(tRef.current);
        tRef.current = window.setTimeout(() => {
            emit(lastRef.current);
        }, delayMs);

        return () => {
            if (tRef.current) window.clearTimeout(tRef.current);
        };
    }, [value, emit, delayMs, enabled]);
}
