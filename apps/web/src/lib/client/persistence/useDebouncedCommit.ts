"use client";

import { useCallback, useEffect, useRef } from "react";
import { stableJson } from "./stableJson";

type CommitFn<T> = (
    value: T,
    serialized: string,
    signal: AbortSignal,
) => Promise<void | { committed?: boolean }> | void | { committed?: boolean };

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
    const hasPendingRef = useRef(false);
    const isFlushingRef = useRef(false);

    useEffect(() => {
        latestValueRef.current = value;
    }, [value]);

    const cancel = useCallback(() => {
        if (timerRef.current != null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        hasPendingRef.current = false;
        abortRef.current?.abort();
        abortRef.current = null;
    }, []);

    const prime = useCallback(
        (next: T) => {
            latestValueRef.current = next;
            lastCommittedRef.current = serializeValue(next);
            hasPendingRef.current = false;
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

        if (serialized === lastCommittedRef.current) {
            hasPendingRef.current = false;
            return;
        }

        if (isFlushingRef.current) {
            hasPendingRef.current = true;
            return;
        }

        const ctrl = new AbortController();
        abortRef.current = ctrl;
        isFlushingRef.current = true;
        hasPendingRef.current = false;

        try {
            const result = await commit(next, serialized, ctrl.signal);
            const committed =
                typeof result === "object" && result !== null
                    ? result.committed !== false
                    : true;
            if (committed) {
                lastCommittedRef.current = serialized;
            }
        } catch (e: any) {
            if (ctrl.signal.aborted) return;
            if (e?.name === "AbortError") return;
            throw e;
        } finally {
            isFlushingRef.current = false;
            if (abortRef.current === ctrl) {
                abortRef.current = null;
            }

            const latestSerialized = serializeValue(latestValueRef.current);
            if (enabled && hasPendingRef.current && latestSerialized !== lastCommittedRef.current) {
                void flush();
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

        hasPendingRef.current = true;
        timerRef.current = window.setTimeout(() => {
            void flush();
        }, delayMs);

        return () => {
            if (timerRef.current != null) {
                window.clearTimeout(timerRef.current);
                timerRef.current = null;
            }
            hasPendingRef.current = false;
        };
    }, [value, enabled, delayMs, serializeValue, flush]);

    useEffect(() => {
        return () => {
            if (timerRef.current != null) {
                window.clearTimeout(timerRef.current);
                timerRef.current = null;
            }
            hasPendingRef.current = false;
            abortRef.current?.abort();
            abortRef.current = null;
        };
    }, []);

    return {
        prime,
        flush,
        cancel,
        lastCommittedRef,
        hasPendingRef,
        isFlushingRef,
    };
}
