"use client";

import { useCallback, useEffect, useRef } from "react";
import { stableJson } from "./stableJson";

type CommitFn<T> = (
    value: T,
    serialized: string,
    signal: AbortSignal,
) => Promise<void> | void;

export function useDebouncedCommit<T>(args: {
    value: T;
    enabled?: boolean;
    delayMs?: number;
    serialize?: (value: T) => string;
    commit: CommitFn<T>;
}) {
    const {
        value,
        enabled = true,
        delayMs = 500,
        serialize,
        commit,
    } = args;

    const serializeValue = serialize ?? ((next: T) => stableJson(next));

    const latestValueRef = useRef<T>(value);
    const lastCommittedRef = useRef<string>("");
    const timerRef = useRef<number | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        latestValueRef.current = value;
    }, [value]);

    const cancel = useCallback(() => {
        if (timerRef.current != null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        abortRef.current?.abort();
        abortRef.current = null;
    }, []);

    const prime = useCallback(
        (next: T) => {
            latestValueRef.current = next;
            lastCommittedRef.current = serializeValue(next);
        },
        [serializeValue],
    );

    const flush = useCallback(async () => {
        if (!enabled) return;

        if (timerRef.current != null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }

        const next = latestValueRef.current;
        const serialized = serializeValue(next);

        if (serialized === lastCommittedRef.current) return;

        abortRef.current?.abort();

        const ctrl = new AbortController();
        abortRef.current = ctrl;

        try {
            await commit(next, serialized, ctrl.signal);
            lastCommittedRef.current = serialized;
        } catch (e: any) {
            if (ctrl.signal.aborted) return;
            if (e?.name === "AbortError") return;
            throw e;
        } finally {
            if (abortRef.current === ctrl) {
                abortRef.current = null;
            }
        }
    }, [enabled, serializeValue, commit]);
    useEffect(() => {
        if (!enabled) return;

        const serialized = serializeValue(value);
        if (serialized === lastCommittedRef.current) return;

        if (timerRef.current != null) {
            window.clearTimeout(timerRef.current);
        }

        timerRef.current = window.setTimeout(() => {
            void flush();
        }, delayMs);

        return () => {
            if (timerRef.current != null) {
                window.clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [value, enabled, delayMs, serializeValue, flush]);

    useEffect(() => {
        return () => {
            if (timerRef.current != null) {
                window.clearTimeout(timerRef.current);
                timerRef.current = null;
            }
            abortRef.current?.abort();
            abortRef.current = null;
        };
    }, []);

    return {
        prime,
        flush,
        cancel,
        lastCommittedRef,
    };
}