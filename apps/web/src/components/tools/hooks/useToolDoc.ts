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

export function useToolDoc(key: ToolDocKey, opts?: { format?: "markdown" | "plain"; debounceMs?: number }) {
    const format = opts?.format ?? "markdown";
    const debounceMs = opts?.debounceMs ?? 450;

    const [body, setBody] = useState("");
    const [state, setState] = useState<SaveState>("loading");
    const [updatedAt, setUpdatedAt] = useState<string | null>(null);

    const lastSavedRef = useRef("");
    const timerRef = useRef<number | null>(null);
    const inflightRef = useRef<AbortController | null>(null);

    const qs = useMemo(() => {
        const p = new URLSearchParams(key as any);
        return p.toString();
    }, [key]);

    // Load
    useEffect(() => {
        let alive = true;
        setState("loading");

        (async () => {
            try {
                const res = await fetch(`/api/tools/doc?${qs}`, { cache: "no-store" });
                const j = await res.json();

                if (!alive) return;

                const v = String(j?.body ?? "");
                setBody(v);
                lastSavedRef.current = v;
                setUpdatedAt(j?.updatedAt ? String(j.updatedAt) : null);
                setState("idle");
            } catch {
                if (!alive) return;
                setState("error");
            }
        })();

        return () => {
            alive = false;
        };
    }, [qs]);

    // Debounced save
    useEffect(() => {
        if (state === "loading") return;
        if (body === lastSavedRef.current) return;

        if (timerRef.current) window.clearTimeout(timerRef.current);

        timerRef.current = window.setTimeout(async () => {
            try {
                setState("saving");

                inflightRef.current?.abort();
                const ac = new AbortController();
                inflightRef.current = ac;

                const res = await fetch(`/api/tools/doc`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...key, format, body }),
                    signal: ac.signal,
                });

                if (!res.ok) throw new Error("save failed");
                const j = await res.json();

                lastSavedRef.current = body;
                setUpdatedAt(j?.updatedAt ? String(j.updatedAt) : null);
                setState("saved");

                window.setTimeout(() => setState("idle"), 600);
            } catch (e: any) {
                if (e?.name === "AbortError") return;
                setState("error");
            }
        }, debounceMs);

        return () => {
            if (timerRef.current) window.clearTimeout(timerRef.current);
        };
    }, [body, key, format, debounceMs, state]);

    async function flush() {
        if (body === lastSavedRef.current) return;
        try {
            const res = await fetch(`/api/tools/doc`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...key, format, body }),
                keepalive: true,
            });
            if (!res.ok) throw new Error("flush failed");
            const j = await res.json();
            lastSavedRef.current = body;
            setUpdatedAt(j?.updatedAt ? String(j.updatedAt) : null);
            setState("idle");
        } catch {
            setState("error");
        }
    }

    return { body, setBody, state, updatedAt, flush };
}