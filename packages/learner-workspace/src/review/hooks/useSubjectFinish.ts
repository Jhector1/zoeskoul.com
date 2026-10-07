"use client";

import { useEffect, useState } from "react";
import type { SubjectFinishState } from "../types/subjectFinish.types";

export function useSubjectFinish(args: {
    subjectSlug: string;
    moduleSlug: string;
    enabled?: boolean;
    refreshKey?: string | number | boolean | null;
}) {
    const {
        subjectSlug,
        moduleSlug,
        enabled = true,
        refreshKey = null,
    } = args;

    const [subjectFinish, setSubjectFinish] = useState<SubjectFinishState | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function loadSubjectFinish() {
            try {
                const res = await fetch(
                    `/api/review/subject-finish?subjectSlug=${encodeURIComponent(subjectSlug)}&moduleSlug=${encodeURIComponent(moduleSlug)}`,
                    { cache: "no-store" },
                );

                if (!res.ok) {
                    if (!cancelled) setSubjectFinish(null);
                    return;
                }

                const data = (await res.json()) as SubjectFinishState;
                if (!cancelled) setSubjectFinish(data);
            } catch {
                if (!cancelled) setSubjectFinish(null);
            }
        }

        if (!enabled || !subjectSlug || !moduleSlug) return;

        loadSubjectFinish();

        return () => {
            cancelled = true;
        };
    }, [subjectSlug, moduleSlug, enabled, refreshKey]);

    return subjectFinish;
}