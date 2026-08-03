"use client";

import { useEffect, useState } from "react";

export function useMediaQuery(query: string) {
    const [matches, setMatches] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return;

        const mq = window.matchMedia(query);

        const apply = () => setMatches(Boolean(mq.matches));
        apply();

        if (mq.addEventListener) mq.addEventListener("change", apply);
        else (mq as any).addListener?.(apply);

        return () => {
            if (mq.removeEventListener) mq.removeEventListener("change", apply);
            else (mq as any).removeListener?.(apply);
        };
    }, [query]);

    return matches;
}