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
import {CodeLanguage, type SqlDialect} from "@/lib/practice/types";
import type { CodeFeedback } from "@/lib/code/feedback/types";

type SqlTableSnapshot = {
    name: string;
    columns: Array<{
        name: string;
        type?: string | null;
    }>;
    rows: unknown[][];
    rowCount: number;
};

type SqlTableSnapshots = Record<string, SqlTableSnapshot>;

export type RegisterArgs = {
    lang: CodeLanguage;
    code: string;
    stdin?: string;

    sqlDialect?: SqlDialect;
    sqlDatasetId?: string;
    sqlSchemaSql?: string;
    sqlSeedSql?: string;
    sqlInitialTableSnapshots?: SqlTableSnapshots;

    onPatch: (patch: any) => void;
};

export type RunFeedbackEntry = {
    feedback: CodeFeedback | null;
    tick: number;
};

export type CodeInputMeta = {
    order: number;
    eligible: boolean;
    done: boolean;
};

export type ReviewToolsValue = {
    enabled: boolean;

    registerCodeInput: (id: string, args: RegisterArgs) => void;
    unregisterCodeInput: (id: string) => void;

    requestBind: (id: string) => void;
    requestBindNext: (afterId: string) => void;
    unbindCodeInput: () => void;

    setCodeInputMeta: (id: string, meta: Partial<CodeInputMeta>) => void;

    boundId: string | null;
    isBound: (id: string) => boolean;

    ensureVisible?: () => void;

    getRunFeedbackEntry: (id: string) => RunFeedbackEntry | null;
    setRunFeedback: (id: string, feedback: CodeFeedback | null) => void;
    clearRunFeedback: (id: string) => void;

    syncCodeInputSnapshot: (id: string, patch: any) => void;
    patchCodeInput: (id: string, patch: any) => void;
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

    const syncCodeInputSnapshot = useCallback((id: string, patch: any) => {
        if (!id) return;

        const cur = registryRef.current.get(id);
        if (!cur) return;

        const next: RegisterArgs = {
            ...cur,
            lang: (patch?.codeLang ?? cur.lang) as CodeLanguage,
            code: typeof patch?.code === "string" ? patch.code : cur.code,
            stdin:
                typeof patch?.codeStdin === "string"
                    ? patch.codeStdin
                    : typeof patch?.stdin === "string"
                        ? patch.stdin
                        : cur.stdin,

            sqlDialect:
                patch?.codeSqlDialect ?? patch?.sqlDialect ?? cur.sqlDialect,
            sqlDatasetId:
                typeof patch?.sqlDatasetId === "string"
                    ? patch.sqlDatasetId
                    : cur.sqlDatasetId,
            sqlSchemaSql:
                typeof patch?.sqlSchemaSql === "string"
                    ? patch.sqlSchemaSql
                    : cur.sqlSchemaSql,
            sqlSeedSql:
                typeof patch?.sqlSeedSql === "string"
                    ? patch.sqlSeedSql
                    : cur.sqlSeedSql,
            sqlInitialTableSnapshots:
                patch?.sqlInitialTableSnapshots && typeof patch.sqlInitialTableSnapshots === "object"
                    ? patch.sqlInitialTableSnapshots
                    : cur.sqlInitialTableSnapshots,
        };
        registryRef.current.set(id, next);
        cur.onPatch?.(patch);
    }, []);

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

    const patchCodeInput = useCallback((id: string, patch: any) => {
        if (!id) return;

        clearRunFeedback(id);
        syncCodeInputSnapshot(id, patch);

        const current = (externalBoundId ?? boundId) ?? null;
        if (current !== id) {
            bindNow(id);
        }
    }, [
        bindNow,
        clearRunFeedback,
        syncCodeInputSnapshot,
        externalBoundId,
        boundId,
    ]);

    const requestBind = useCallback(
        (id: string) => {
            if (!enabledRef.current) return;
            if (!id) return;
            bindNow(id);
        },
        [bindNow],
    );
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

    useEffect(() => {
        if (!enabled) return;
        reconcileBinding();
    }, [enabled, reconcileBinding, externalBoundId]);



    const requestBindNext = useCallback(
        (afterId: string) => {
            if (!enabledRef.current) return;

            const ordered = orderRef.current.filter((id) => registryRef.current.has(id));
            const startIndex = ordered.indexOf(afterId);

            for (let i = startIndex + 1; i < ordered.length; i += 1) {
                const id = ordered[i];
                const meta = metaRef.current.get(id);

                if (!meta) continue;
                if (!meta.eligible) continue;
                if (meta.done) continue;

                bindNow(id);
                return;
            }

            reconcileBinding();
        },
        [bindNow, reconcileBinding],
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

            syncCodeInputSnapshot,
            patchCodeInput,
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
            syncCodeInputSnapshot,
            patchCodeInput,
        ],
    );

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useReviewTools() {
    return useContext(Ctx);
}