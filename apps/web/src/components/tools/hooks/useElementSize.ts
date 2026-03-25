// src/lib/ui/useElementSize.ts
"use client";

import * as React from "react";

export function useElementSize<T extends HTMLElement>() {
    const ref = React.useRef<T | null>(null);
    const [size, setSize] = React.useState({ w: 0, h: 0 });

    React.useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;

        const measure = () => {
            const r = el.getBoundingClientRect();
            const w = Math.max(0, Math.floor(r.width));
            const h = Math.max(0, Math.floor(r.height));
            setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
        };

        measure();

        // ResizeObserver = best (captures tab switch, flex changes, panel open, etc.)
        if (typeof ResizeObserver !== "undefined") {
            const ro = new ResizeObserver(() => measure());
            ro.observe(el);
            return () => ro.disconnect();
        }

        // fallback
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    }, []);

    return { ref, size };
}