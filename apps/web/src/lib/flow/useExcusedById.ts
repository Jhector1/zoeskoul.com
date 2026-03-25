// src/lib/flow/useExcusedById.ts
"use client";

import { useCallback, useEffect, useState } from "react";
import {
    excuseId,
    isExcusedId,
    normalizeExcusedById,
    type ExcusedById,
} from "./excuse";

export function useExcusedById(args: {
    resetKey: string;
    initial?: any;
}) {
    const { resetKey, initial } = args;

    const [excusedById, setExcusedById] = useState<ExcusedById>(() =>
        normalizeExcusedById(initial),
    );

    useEffect(() => {
        setExcusedById(normalizeExcusedById(initial));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resetKey]);

    const isExcused = useCallback(
        (id: string) => isExcusedId(excusedById, id),
        [excusedById],
    );

    const excuse = useCallback((id: string, reason?: string | null) => {
        setExcusedById((prev) => excuseId(prev, id, reason ?? null));
    }, []);

    const clear = useCallback(() => setExcusedById({}), []);

    return { excusedById, setExcusedById, isExcused, excuse, clear };
}