"use client";

import { useEffect, useRef } from "react";

export function useFlushOnPageExit(
    flush: () => void,
    enabled = true,
) {
    const flushedRef = useRef(false);

    useEffect(() => {
        if (!enabled) return;

        flushedRef.current = false;

        const flushOnce = () => {
            if (flushedRef.current) return;
            flushedRef.current = true;
            flush();
        };

        const onVisibilityChange = () => {
            if (document.visibilityState === "hidden") {
                flushOnce();
            }
        };

        window.addEventListener("pagehide", flushOnce);
        document.addEventListener("visibilitychange", onVisibilityChange);

        return () => {
            window.removeEventListener("pagehide", flushOnce);
            document.removeEventListener("visibilitychange", onVisibilityChange);
        };
    }, [flush, enabled]);
}