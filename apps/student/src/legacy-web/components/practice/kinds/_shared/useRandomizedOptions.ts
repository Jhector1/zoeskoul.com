"use client";

import { useEffect, useMemo, useState } from "react";
import {
    buildStableSeedKey,
    shuffleItems,
    type PresentableOption,
} from "@/lib/practice/presentationOrder";

export function useRandomizedOptions(options: PresentableOption[]) {
    const optionIds = useMemo(() => options.map((o) => o.id), [options]);

    const seedKey = useMemo(
        () => buildStableSeedKey(optionIds),
        [optionIds],
    );

    const [orderedIds, setOrderedIds] = useState<string[]>(() =>
        shuffleItems(optionIds),
    );

    useEffect(() => {
        setOrderedIds(shuffleItems(optionIds));
    }, [seedKey]);

    return useMemo(() => {
        const byId = new Map(options.map((o) => [o.id, o]));
        const ordered = orderedIds
            .map((id) => byId.get(id))
            .filter(Boolean) as PresentableOption[];

        const seen = new Set(ordered.map((o) => o.id));
        const missing = options.filter((o) => !seen.has(o.id));

        return [...ordered, ...missing];
    }, [options, orderedIds]);
}