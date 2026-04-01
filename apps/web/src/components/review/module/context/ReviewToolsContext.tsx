// src/components/review/module/context/ReviewToolsContext.tsx
"use client";

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { CodeLanguage } from "@/lib/practice/types";
import type { CodeFeedback } from "@/lib/code/feedback/types";

export type RegisterArgs = {
    lang: CodeLanguage;
    code: string;
    stdin?: string;
    onPatch: (patch: any) => void;
};
export type RunFeedbackEntry = {
    feedback: CodeFeedback | null;
    tick: number;
};
export type CodeInputMeta = {
    /** Global ordering across the page (smaller = earlier). */
    order: number;
    /** If false, skip for binding (locked/unavailable). */
    eligible: boolean;
    /** If true, skip for binding (answered/flow-complete). */
    done: boolean;
};

export type ReviewToolsValue = {
    /** Tools enabled for this page/device */
    enabled: boolean;

    registerCodeInput: (id: string, args: RegisterArgs) => void;
    unregisterCodeInput: (id: string) => void;

    /**
     * Deterministic: Tools always binds to the first unanswered eligible code_input.
     * requestBind / requestBindNext are kept for compatibility, but they reconcile to that rule.
     */
    requestBind: (id: string) => void;
    requestBindNext: (afterId: string) => void;
    unbindCodeInput: () => void;

    /** QuizPracticeCard reports ordering + completion/unlock status */
    setCodeInputMeta: (id: string, meta: Partial<CodeInputMeta>) => void;

    boundId: string | null;
    isBound: (id: string) => boolean;

    ensureVisible?: () => void;

    /** NEW: share plain Run feedback from Tools pane to bound exercise card */
    getRunFeedbackEntry: (id: string) => RunFeedbackEntry | null;
    setRunFeedback: (id: string, feedback: CodeFeedback | null) => void;
    clearRunFeedback: (id: string) => void;
};

const Ctx = createContext<ReviewToolsValue | null>(null);

function defer(fn: () => void) {
    if (typeof queueMicrotask === "function") queueMicrotask(fn);
    else Promise.resolve().then(fn);
}

export function ReviewToolsProvider({
                                        children,
                                        ensureVisible,
                                        onBindToToolsPanel,
                                        onUnbindFromToolsPanel,
                                        externalBoundId,
                                        enabled = true,
                                        mode = "first_unanswered",
                                        resetKey,
                                    }: {
    children: React.ReactNode;
    ensureVisible?: () => void;

    onBindToToolsPanel: (args: { id: string } & RegisterArgs) => void;
    onUnbindFromToolsPanel?: () => void;

    externalBoundId?: string | null;

    enabled?: boolean;

    mode?: "first_unanswered" | "first_registered";
    resetKey?: string;
}) {
    const enabledRef = useRef(Boolean(enabled));
    useEffect(() => {
        enabledRef.current = Boolean(enabled);
    }, [enabled]);

    const registryRef = useRef(new Map<string, RegisterArgs>());
    const orderRef = useRef<string[]>([]);
    const metaRef = useRef(new Map<string, CodeInputMeta>());

    const [boundId, setBoundId] = useState<string | null>(externalBoundId ?? null);
    const [requestedId, setRequestedId] = useState<string | null>(null);

    const [registryTick, setRegistryTick] = useState(0);
    const [metaTick, setMetaTick] = useState(0);

    const [runFeedbackById, setRunFeedbackById] = useState<Record<string, RunFeedbackEntry>>({});
    // avoid strict-mode unbind flicker
    const unbindTimersRef = useRef(new Map<string, number>());

    const clearUnbindTimer = useCallback((id: string) => {
        const t = unbindTimersRef.current.get(id);
        if (t) window.clearTimeout(t);
        unbindTimersRef.current.delete(id);
    }, []);

    useEffect(() => {
        return () => {
            for (const t of unbindTimersRef.current.values()) window.clearTimeout(t);
            unbindTimersRef.current.clear();
        };
    }, []);

    const getRunFeedbackEntry = useCallback((id: string) => {
        if (!id) return null;
        return runFeedbackById[id] ?? null;
    }, [runFeedbackById]);

    const setRunFeedback = useCallback((id: string, feedback: CodeFeedback | null) => {
        if (!id) return;

        setRunFeedbackById((prev) => {
            const cur = prev[id];
            const next: RunFeedbackEntry = {
                feedback: feedback ?? null,
                tick: (cur?.tick ?? 0) + 1,
            };

            return { ...prev, [id]: next };
        });
    }, []);

    const clearRunFeedback = useCallback((id: string) => {
        if (!id) return;
        setRunFeedbackById((prev) => {
            if (!(id in prev)) return prev;
            const next = { ...prev };
            delete next[id];
            return next;
        });
    }, []);

    // If enabled flips OFF, force unbind + clear.
    useEffect(() => {
        if (enabled) return;

        registryRef.current.clear();
        orderRef.current = [];
        metaRef.current.clear();

        setRequestedId(null);
        setBoundId(null);
        setRunFeedbackById({});

        onUnbindFromToolsPanel?.();

        setRegistryTick((x) => x + 1);
        setMetaTick((x) => x + 1);
    }, [enabled, onUnbindFromToolsPanel]);

    // reset registry/order/meta on topic reset
    const lastResetRef = useRef<string | null>(null);
    useEffect(() => {
        if (!resetKey) return;

        if (lastResetRef.current == null) {
            lastResetRef.current = resetKey;
            return;
        }

        if (lastResetRef.current !== resetKey) {
            registryRef.current.clear();
            orderRef.current = [];
            metaRef.current.clear();

            onUnbindFromToolsPanel?.();

            setRequestedId(null);
            setBoundId(externalBoundId ?? null);
            setRunFeedbackById({});

            setRegistryTick((x) => x + 1);
            setMetaTick((x) => x + 1);
        }

        lastResetRef.current = resetKey;
    }, [resetKey, externalBoundId, onUnbindFromToolsPanel]);

    // keep provider boundId consistent with external tool state
    useEffect(() => {
        if (externalBoundId === undefined) return;
        const next = externalBoundId ?? null;

        setBoundId((cur) => (cur === next ? cur : next));

        if (next == null) {
            setRequestedId(null);
        }
    }, [externalBoundId]);

    const unbindCodeInput = useCallback(() => {
        const currentBound = (externalBoundId ?? boundId) ?? null;

        if (currentBound) {
            setRunFeedbackById((prev) => {
                if (!(currentBound in prev)) return prev;
                const next = { ...prev };
                delete next[currentBound];
                return next;
            });
        }

        setBoundId(null);
        setRequestedId(null);
        onUnbindFromToolsPanel?.();
    }, [externalBoundId, boundId, onUnbindFromToolsPanel]);

    const isBound = useCallback(
        (id: string) => (externalBoundId ?? boundId) === id,
        [externalBoundId, boundId],
    );

    const bindNow = useCallback(
        (id: string) => {
            if (!enabledRef.current) return;

            const snap = registryRef.current.get(id);
            if (!snap) {
                setRequestedId(id);
                return;
            }

            ensureVisible?.();
            onBindToToolsPanel({ id, ...snap });
            setBoundId(id);
            setRequestedId(null);
        },
        [ensureVisible, onBindToToolsPanel],
    );

    const pickFirstUnanswered = useCallback((): string | null => {
        let bestId: string | null = null;
        let bestOrder = Number.POSITIVE_INFINITY;

        for (const [id, m] of metaRef.current.entries()) {
            if (!m) continue;
            if (!m.eligible) continue;
            if (m.done) continue;

            const ord = Number.isFinite(m.order) ? m.order : Number.POSITIVE_INFINITY;

            if (ord < bestOrder) {
                bestOrder = ord;
                bestId = id;
            } else if (ord === bestOrder && bestId != null) {
                if (id < bestId) bestId = id;
            }
        }

        return bestId;
    }, []);

    const pickFirstRegistered = useCallback((): string | null => {
        const first = orderRef.current.find((id) => registryRef.current.has(id));
        return first ?? null;
    }, []);

    const reconcileBinding = useCallback(() => {
        if (!enabledRef.current) return;

        const effectiveBound = (externalBoundId ?? boundId) ?? null;

        let desired: string | null = null;
        if (mode === "first_unanswered") desired = pickFirstUnanswered();
        else desired = pickFirstRegistered();

        if (!desired) {
            if (effectiveBound != null) unbindCodeInput();
            return;
        }

        if (effectiveBound === desired) return;

        defer(() => bindNow(desired));
    }, [
        externalBoundId,
        boundId,
        mode,
        pickFirstUnanswered,
        pickFirstRegistered,
        unbindCodeInput,
        bindNow,
    ]);

    useEffect(() => {
        if (!enabled) return;
        reconcileBinding();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, registryTick, metaTick, mode]);

    const requestBind = useCallback(
        (_id: string) => {
            if (!enabledRef.current) return;
            reconcileBinding();
        },
        [reconcileBinding],
    );

    useEffect(() => {
        if (!enabled) return;
        reconcileBinding();
    }, [enabled, reconcileBinding, externalBoundId]);

    const requestBindNext = useCallback(
        (_afterId: string) => {
            if (!enabledRef.current) return;
            reconcileBinding();
        },
        [reconcileBinding],
    );

    const setCodeInputMeta = useCallback((id: string, patch: Partial<CodeInputMeta>) => {
        if (!enabledRef.current) return;

        const cur = metaRef.current.get(id);
        const next: CodeInputMeta = {
            order: patch.order ?? cur?.order ?? Number.POSITIVE_INFINITY,
            eligible: patch.eligible ?? cur?.eligible ?? false,
            done: patch.done ?? cur?.done ?? false,
        };

        const same =
            cur &&
            cur.order === next.order &&
            cur.eligible === next.eligible &&
            cur.done === next.done;

        metaRef.current.set(id, next);
        if (!same) setMetaTick((x) => x + 1);
    }, []);

    const registerCodeInput = useCallback(
        (id: string, args: RegisterArgs) => {
            if (!enabledRef.current) return;

            clearUnbindTimer(id);

            const had = registryRef.current.has(id);
            if (!orderRef.current.includes(id)) orderRef.current.push(id);

            registryRef.current.set(id, args);

            if (!had) setRegistryTick((x) => x + 1);

            if (requestedId === id) {
                defer(() => bindNow(id));
                return;
            }

            const curBound = (externalBoundId ?? boundId) ?? null;
            if (curBound === id) {
                defer(() => onBindToToolsPanel({ id, ...args }));
            }
        },
        [
            clearUnbindTimer,
            requestedId,
            bindNow,
            externalBoundId,
            boundId,
            onBindToToolsPanel,
        ],
    );

    const unregisterCodeInput = useCallback(
        (id: string) => {
            registryRef.current.delete(id);
            metaRef.current.delete(id);
            setRegistryTick((x) => x + 1);
            setMetaTick((x) => x + 1);
            clearRunFeedback(id);

            const t = window.setTimeout(() => {
                unbindTimersRef.current.delete(id);

                const effectiveBound = (externalBoundId ?? boundId) ?? null;
                if (effectiveBound === id && !registryRef.current.has(id)) {
                    unbindCodeInput();
                }
            }, 0);

            unbindTimersRef.current.set(id, t);

            if (requestedId === id) setRequestedId(null);
        },
        [clearRunFeedback, externalBoundId, boundId, requestedId, unbindCodeInput],
    );

    const value = useMemo<ReviewToolsValue>(
        () => ({
            enabled: Boolean(enabled),

            registerCodeInput,
            unregisterCodeInput,
            requestBind,
            requestBindNext,
            unbindCodeInput,

            setCodeInputMeta,

            boundId: (externalBoundId ?? boundId) ?? null,
            isBound,
            ensureVisible: enabled ? ensureVisible : undefined,

            getRunFeedbackEntry,
            setRunFeedback,
            clearRunFeedback,
        }),
        [
            enabled,
            registerCodeInput,
            unregisterCodeInput,
            requestBind,
            requestBindNext,
            unbindCodeInput,
            setCodeInputMeta,
            externalBoundId,
            boundId,
            isBound,
            ensureVisible,
            getRunFeedbackEntry,
            setRunFeedback,
            clearRunFeedback,
        ],
    );

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useReviewTools() {
    return useContext(Ctx);
}