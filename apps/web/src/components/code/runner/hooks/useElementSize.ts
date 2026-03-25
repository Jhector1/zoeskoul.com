"use client";

import * as React from "react";

export function useElementSize<T extends HTMLElement>(ref: React.RefObject<T | null>) {
    const [size, setSize] = React.useState({ width: 0, height: 0 });

    React.useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;

        const ro = new ResizeObserver(([entry]) => {
            const cr = entry.contentRect;
            setSize({ width: cr.width, height: cr.height });
        });

        ro.observe(el);
        return () => ro.disconnect();
    }, [ref]);

    return size;
}
