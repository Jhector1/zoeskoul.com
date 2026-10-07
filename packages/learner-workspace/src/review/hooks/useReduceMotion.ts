"use client";

import { useEffect, useState } from "react";

export function useReduceMotion() {
    const [reduceMotion, setReduceMotion] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return;

        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");

        const apply = () => setReduceMotion(Boolean(mq.matches));
        apply();

        if (mq.addEventListener) mq.addEventListener("change", apply);
        else mq.addListener?.(apply);

        return () => {
            if (mq.removeEventListener) mq.removeEventListener("change", apply);
            else mq.removeListener?.(apply);
        };
    }, []);

    return reduceMotion;
}
