"use client";

import { useEffect, useMemo, useState } from "react";
import {
    buildStableSeedKey,
    shuffleItems,
} from "@/lib/practice/presentationOrder";

export function useRandomizedIdOrder(args: {
    sourceIds: string[];
    savedIds?: string[] | null;
}) {
    const { sourceIds, savedIds } = args;

    const seedKey = useMemo(
        () => buildStableSeedKey(sourceIds),
        [sourceIds],
    );

    const [randomizedIds, setRandomizedIds] = useState<string[]>(() =>
        shuffleItems(sourceIds),
    );

    useEffect(() => {
        setRandomizedIds(shuffleItems(sourceIds));
    }, [seedKey]);

    return useMemo(() => {
        const base =
            Array.isArray(savedIds) && savedIds.length ? savedIds : randomizedIds;

        const valid = new Set(sourceIds);
        const filtered = base.filter((id) => valid.has(id));

        for (const id of sourceIds) {
            if (!filtered.includes(id)) filtered.push(id);
        }

        return filtered;
    }, [savedIds, randomizedIds, sourceIds]);
}