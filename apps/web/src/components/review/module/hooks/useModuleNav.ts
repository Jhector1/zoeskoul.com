"use client";

import { useEffect, useState } from "react";

export type CourseModuleNavItem = {
    slug: string;
    title: string;
    order: number;
    index: number;
    current: boolean;
    locked: boolean;
    billingHref: string | null;
};

export type ModuleNavInfo = {
    prevModuleId: string | null;
    nextModuleId: string | null;
    nextLocked: boolean;
    nextBillingHref?: string | null;
    index: number;
    total: number;
    modules: CourseModuleNavItem[];
} | null;

export function useModuleNav(args: {
    subjectSlug: string;
    moduleSlug: string;
    catalogSlug?: string | null;
}) {
    const { subjectSlug, moduleSlug, catalogSlug = null } = args;
    const [nav, setNav] = useState<ModuleNavInfo | undefined>(undefined);

    useEffect(() => {
        if (!subjectSlug || !moduleSlug) return;
        setNav(undefined);

        const ctrl = new AbortController();
        const search = new URLSearchParams({
            subjectSlug,
            moduleSlug,
        });

        if (catalogSlug) {
            search.set("catalogSlug", catalogSlug);
        }

        fetch(`/api/review/module-nav?${search.toString()}`, {
            cache: "no-store",
            signal: ctrl.signal,
        })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => setNav(d))
            .catch((e) => {
                if (e?.name !== "AbortError") setNav(null);
            });

        return () => ctrl.abort();
    }, [catalogSlug, subjectSlug, moduleSlug]);

    return nav;
}
