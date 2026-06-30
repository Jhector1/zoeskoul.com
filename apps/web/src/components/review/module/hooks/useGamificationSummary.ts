"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GamificationSummary } from "@/lib/gamification/types";
import {
    emitGamificationUpdate,
    subscribeGamificationUpdate,
} from "@/lib/gamification/browserEvents";

type GamificationSummaryResponse = {
    summary?: GamificationSummary | null;
};

const SUMMARY_CACHE_TTL_MS = 30_000;
const SUMMARY_FETCH_TIMEOUT_MS = 12_000;

let cachedSummary: GamificationSummary | null = null;
let cachedSummaryAt = 0;
let inFlightSummary: Promise<GamificationSummary | null> | null = null;

function nowMs() {
    return Date.now();
}

function isFreshSummary() {
    return Boolean(cachedSummary) && nowMs() - cachedSummaryAt < SUMMARY_CACHE_TTL_MS;
}

function isAbortLikeError(error: unknown) {
    if (!error || typeof error !== "object") return false;
    const name = "name" in error ? String((error as { name?: unknown }).name ?? "") : "";
    return name === "AbortError" || name === "TimeoutError";
}

async function fetchGamificationSummary(args?: {
    force?: boolean;
}): Promise<GamificationSummary | null> {
    const force = Boolean(args?.force);

    if (!force && isFreshSummary()) {
        return cachedSummary;
    }

    if (inFlightSummary) {
        return inFlightSummary;
    }

    inFlightSummary = (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), SUMMARY_FETCH_TIMEOUT_MS);

        try {
            const res = await fetch("/api/gamification/me", {
                cache: "no-store",
                signal: controller.signal,
                headers: {
                    Accept: "application/json",
                },
            });

            if (!res.ok) return cachedSummary;

            const data = (await res.json().catch(() => null)) as
                | GamificationSummaryResponse
                | null;
            const summary = data?.summary ?? null;
            if (!summary) return cachedSummary;

            cachedSummary = summary;
            cachedSummaryAt = nowMs();
            return summary;
        } catch (error) {
            // Navigation, dev-server recompiles, ad blockers, and transient offline states can
            // all surface as TypeError: Failed to fetch. Gamification is decorative, so it
            // must never throw into the review page error overlay or block exercises.
            if (process.env.NODE_ENV !== "production" && !isAbortLikeError(error)) {
                console.warn("[gamification] summary refresh failed", error);
            }
            return cachedSummary;
        } finally {
            clearTimeout(timeout);
            inFlightSummary = null;
        }
    })();

    return inFlightSummary;
}

export function useGamificationSummary() {
    const [loading, setLoading] = useState(() => !cachedSummary);
    const [summary, setSummary] = useState<GamificationSummary | null>(() => cachedSummary);
    const mountedRef = useRef(false);
    const lastFocusRefreshAtRef = useRef(0);

    const refresh = useCallback(async (options?: { force?: boolean }) => {
        const next = await fetchGamificationSummary(options);
        if (!mountedRef.current) return next;

        if (next) {
            setSummary(next);
            emitGamificationUpdate({
                source: "summary",
                summary: next,
            });
        }

        setLoading(false);
        return next;
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        void refresh();

        return () => {
            mountedRef.current = false;
        };
    }, [refresh]);

    useEffect(() => {
        return subscribeGamificationUpdate((payload) => {
            cachedSummary = payload.summary;
            cachedSummaryAt = nowMs();
            setSummary(payload.summary);
            setLoading(false);
        });
    }, []);

    useEffect(() => {
        const onFocus = () => {
            const now = nowMs();
            if (now - lastFocusRefreshAtRef.current < SUMMARY_CACHE_TTL_MS) return;
            lastFocusRefreshAtRef.current = now;
            void refresh({ force: true });
        };

        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
    }, [refresh]);

    return {
        loading,
        summary,
        refresh,
    };
}
