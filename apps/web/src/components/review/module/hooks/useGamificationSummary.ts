"use client";

import { useCallback, useEffect, useState } from "react";
import type { GamificationSummary } from "@/lib/gamification/types";
import {
    emitGamificationUpdate,
    subscribeGamificationUpdate,
} from "@/lib/gamification/browserEvents";

export function useGamificationSummary() {
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState<GamificationSummary | null>(null);

    const refresh = useCallback(async () => {
        try {
            const res = await fetch("/api/gamification/me", {
                cache: "no-store",
            });

            if (!res.ok) return;

            const data = await res.json().catch(() => null);
            if (!data?.summary) return;

            setSummary(data.summary);
            emitGamificationUpdate({
                source: "summary",
                summary: data.summary,
            });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    useEffect(() => {
        return subscribeGamificationUpdate((payload) => {
            setSummary(payload.summary);
            setLoading(false);
        });
    }, []);

    useEffect(() => {
        const onFocus = () => void refresh();
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
    }, [refresh]);

    return {
        loading,
        summary,
        refresh,
    };
}