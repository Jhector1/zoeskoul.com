"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type ToolDocKey = {
    subjectSlug: string;
    moduleId: string;
    locale: string;
    toolId: string;   // "notes"
    scopeKey: string; // "general" | "exercise:<id>"
};

type SaveState = "loading" | "idle" | "saving" | "saved" | "error";

export function useToolDoc(
    key: ToolDocKey,
    opts?: {
        format?: "markdown" | "plain";
        debounceMs?: number;
        endpoint?: string;
        requestKey?: Record<string, string>;
        refreshMs?: number;
    },
) {
    const format = opts?.format ?? "markdown";
    const debounceMs = opts?.debounceMs ?? 450;
    const endpoint = opts?.endpoint ?? "/api/tools/doc";
    const refreshMs = opts?.refreshMs ?? 0;

    const [body, setBody] = useState("");
    const [state, setState] = useState<SaveState>("loading");
    const [updatedAt, setUpdatedAt] = useState<string | null>(null);
    const [loadedQuery, setLoadedQuery] = useState<string | null>(null);

    const lastSavedRef = useRef("");
    const loadedRef = useRef(false);
    const latestBodyRef = useRef("");
    const timerRef = useRef<number | null>(null);
    const inflightRef = useRef<AbortController | null>(null);

    const qs = useMemo(() => {
        const p = new URLSearchParams((opts?.requestKey ?? key) as any);
        return p.toString();
    }, [key, opts?.requestKey]);

    useEffect(() => {
        latestBodyRef.current = body;
    }, [body]);

    // Load
    useEffect(() => {
        let alive = true;
        loadedRef.current = false;
        setLoadedQuery(null);
        setState("loading");

        (async () => {
            try {
                const res = await fetch(`${endpoint}?${qs}`, { cache: "no-store" });
                const j = await res.json();

                if (!alive) return;

                const v = String(j?.body ?? "");
                setBody(v);
                latestBodyRef.current = v;
                lastSavedRef.current = v;
                loadedRef.current = true;
                setLoadedQuery(qs);
                setUpdatedAt(j?.updatedAt ? String(j.updatedAt) : null);
                setState("idle");
            } catch {
                if (!alive) return;
                loadedRef.current = true;
                setLoadedQuery(null);
                setState("error");
            }
        })();

        return () => {
            alive = false;
        };
    }, [endpoint, qs]);

    // Debounced save
    useEffect(() => {
        if (!loadedRef.current) return;
        if (body === lastSavedRef.current) return;

        if (timerRef.current) window.clearTimeout(timerRef.current);

        timerRef.current = window.setTimeout(async () => {
            const bodyToSave = latestBodyRef.current;
            if (bodyToSave === lastSavedRef.current) return;

            let savingUiTimer: number | null = null;
            try {
                inflightRef.current?.abort();
                const ac = new AbortController();
                inflightRef.current = ac;

                // Do not flip the whole UI into a busy state for fast saves.
                savingUiTimer = window.setTimeout(() => setState("saving"), 350);

                const requestTimeout = window.setTimeout(() => ac.abort(), 12000);
                const res = await fetch(endpoint, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...(opts?.requestKey ?? key), format, body: bodyToSave }),
                    signal: ac.signal,
                }).finally(() => window.clearTimeout(requestTimeout));

                if (!res.ok) throw new Error("save failed");
                const j = await res.json();

                lastSavedRef.current = bodyToSave;
                setUpdatedAt(j?.updatedAt ? String(j.updatedAt) : null);
                setState("saved");

                window.setTimeout(() => {
                    if (latestBodyRef.current === lastSavedRef.current) setState("idle");
                }, 600);
            } catch (e: any) {
                if (e?.name === "AbortError") {
                    setState("idle");
                    return;
                }
                setState("error");
            } finally {
                if (savingUiTimer != null) window.clearTimeout(savingUiTimer);
            }
        }, Math.max(debounceMs, 900));

        return () => {
            if (timerRef.current) window.clearTimeout(timerRef.current);
        };
    }, [body, key, format, debounceMs, endpoint, opts?.requestKey]);


    useEffect(() => {
        if (!refreshMs || refreshMs < 1000) return;
        const timer = window.setInterval(async () => {
            if (latestBodyRef.current !== lastSavedRef.current) return;
            try {
                const res = await fetch(`${endpoint}?${qs}`, { cache: "no-store" });
                if (!res.ok) return;
                const j = await res.json();
                const next = String(j?.body ?? "");
                if (next !== lastSavedRef.current) {
                    setBody(next);
                    latestBodyRef.current = next;
                    lastSavedRef.current = next;
                    setUpdatedAt(j?.updatedAt ? String(j.updatedAt) : null);
                }
            } catch {
                // Polling is best-effort; normal save state remains authoritative.
            }
        }, refreshMs);
        return () => window.clearInterval(timer);
    }, [endpoint, qs, refreshMs]);

    async function flush() {
        const bodyToSave = latestBodyRef.current;
        if (bodyToSave === lastSavedRef.current) return;
        try {
            const res = await fetch(endpoint, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...(opts?.requestKey ?? key), format, body: bodyToSave }),
                keepalive: true,
            });
            if (!res.ok) throw new Error("flush failed");
            const j = await res.json();
            lastSavedRef.current = bodyToSave;
            setUpdatedAt(j?.updatedAt ? String(j.updatedAt) : null);
            setState("idle");
        } catch {
            setState("error");
        }
    }

    return { body, setBody, state, updatedAt, hydrated: loadedQuery === qs, flush };
}