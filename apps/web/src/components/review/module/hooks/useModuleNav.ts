"use client";

import { useEffect, useState } from "react";

export type ModuleNavInfo = {
    prevModuleId: string | null;
    nextModuleId: string | null;
    nextLocked: boolean;
    nextBillingHref?: string | null;
    index: number;
    total: number;
} | null;

export function useModuleNav(args: { subjectSlug: string; moduleSlug: string }) {
    const { subjectSlug, moduleSlug } = args;
    const [nav, setNav] = useState<ModuleNavInfo | undefined>(undefined);

    useEffect(() => {
        if (!subjectSlug || !moduleSlug) return;
        setNav(undefined);

        const ctrl = new AbortController();

        fetch(
            `/api/review/module-nav?subjectSlug=${encodeURIComponent(subjectSlug)}&moduleSlug=${encodeURIComponent(moduleSlug)}`,
            {
                cache: "no-store",
                signal: ctrl.signal,
            },
        )
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => setNav(d))
            .catch((e) => {
                if (e?.name !== "AbortError") setNav(null);
            });

        return () => ctrl.abort();
    }, [subjectSlug, moduleSlug]);

    return nav;
}