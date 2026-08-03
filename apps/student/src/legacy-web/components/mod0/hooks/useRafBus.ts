"use client";

import * as React from "react";

export type RafBus = {
    subscribe: (cb: () => void) => () => void;
    emit: () => void;
    emitRaf: () => void;
};

export function useRafBus(): RafBus {
    const listenersRef = React.useRef(new Set<() => void>());
    const rafRef = React.useRef<number | null>(null);

    const subscribe = React.useCallback((cb: () => void) => {
        listenersRef.current.add(cb);
        return () => listenersRef.current.delete(cb);
    }, []);

    const emit = React.useCallback(() => {
        for (const fn of listenersRef.current) fn();
    }, []);

    const emitRaf = React.useCallback(() => {
        if (rafRef.current != null) return;
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;
            emit();
        });
    }, [emit]);

    React.useEffect(() => {
        return () => {
            if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        };
    }, []);

    return React.useMemo(() => ({ subscribe, emit, emitRaf }), [subscribe, emit, emitRaf]);
}
