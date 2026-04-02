"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CodeLanguage, SqlDialect } from "@/lib/practice/types";
import { useDebouncedCommit } from "@/lib/client/persistence/useDebouncedCommit";
import { useFlushOnPageExit } from "@/lib/client/persistence/useFlushOnPageExit";

type BoundTarget = { id: string; onPatch: (patch: any) => void };

type ToolSnap = {
    lang: CodeLanguage;
    code: string;
    stdin: string;
    sqlDialect: SqlDialect;
};

function snapKey(s: ToolSnap) {
    return `${s.lang}::${s.sqlDialect}::${s.stdin}::${s.code}`;
}

export function useToolCodeRunnerState(args: {
    progress: any;
    progressHydrated: boolean;
    setProgress: (updater: any) => void;
    viewTid: string;

    toolKey?: string;
    defaultLang?: CodeLanguage;
    defaultCode?: string;
    defaultStdin?: string;
    defaultSqlDialect?: SqlDialect;

    rightCollapsed: boolean;
    rightW: number;

    toolSaveDelayMs?: number;
}) {
    const {
        progress,
        progressHydrated,
        setProgress,
        viewTid,
        toolKey = "codeRunner",
        defaultLang = "python",
        defaultCode = `print("hello world")`,
        defaultStdin = "",
        defaultSqlDialect = "postgres",
        rightCollapsed,
        rightW,
        toolSaveDelayMs = 700,
    } = args;

    const versionStr = useMemo(() => {
        const moduleV = (progress as any)?.quizVersion ?? 0;
        const topicV = (progress as any)?.topics?.[viewTid]?.quizVersion ?? 0;
        return `${moduleV}.${topicV}`;
    }, [progress, viewTid]);

    const boundRef = useRef<BoundTarget | null>(null);
    const [boundId, setBoundId] = useState<string | null>(null);
    const boundDirtyRef = useRef(false);

    const isBound = useCallback((id: string) => boundRef.current?.id === id, []);

    const clearBoundState = useCallback(() => {
        boundRef.current = null;
        boundDirtyRef.current = false;
        setBoundId((prev) => (prev === null ? prev : null));
    }, []);

    const saved = useMemo(() => {
        return (progress as any)?.topics?.[viewTid]?.toolState?.[toolKey] ?? null;
    }, [progress, viewTid, toolKey]);

    const initialLang = (saved?.lang as CodeLanguage) ?? defaultLang;
    const initialCode = typeof saved?.code === "string" ? saved.code : defaultCode;
    const initialStdin = typeof saved?.stdin === "string" ? saved.stdin : defaultStdin;
    const initialSqlDialect = (saved?.sqlDialect as SqlDialect) ?? defaultSqlDialect;

    const [toolLang, setToolLang0] = useState<CodeLanguage>(initialLang);
    const [toolCode, setToolCode0] = useState<string>(initialCode);
    const [toolStdin, setToolStdin0] = useState<string>(initialStdin);
    const [toolSqlDialect, setToolSqlDialect0] = useState<SqlDialect>(initialSqlDialect);

    const latestSnapRef = useRef<ToolSnap>({
        lang: initialLang,
        code: initialCode,
        stdin: initialStdin,
        sqlDialect: initialSqlDialect,
    });

    const toolSnap = useMemo<ToolSnap>(
        () => ({
            lang: toolLang,
            code: toolCode,
            stdin: toolStdin,
            sqlDialect: toolSqlDialect,
        }),
        [toolLang, toolCode, toolStdin, toolSqlDialect],
    );

    const commitToolToProgress = useCallback(
        async (latest: ToolSnap) => {
            setProgress((p: any) => {
                const tp0: any = p?.topics?.[viewTid] ?? {};
                const prevToolState = tp0?.toolState?.[toolKey] ?? null;

                if (
                    prevToolState?.lang === latest.lang &&
                    prevToolState?.code === latest.code &&
                    prevToolState?.stdin === latest.stdin &&
                    prevToolState?.sqlDialect === latest.sqlDialect
                ) {
                    return p;
                }

                const toolState = { ...(tp0.toolState ?? {}) };
                toolState[toolKey] = {
                    lang: latest.lang,
                    code: latest.code,
                    stdin: latest.stdin,
                    sqlDialect: latest.sqlDialect,
                };

                return {
                    ...p,
                    topics: {
                        ...(p?.topics ?? {}),
                        [viewTid]: { ...tp0, toolState },
                    },
                };
            });
        },
        [setProgress, viewTid, toolKey],
    );

    const { prime, flush, cancel } = useDebouncedCommit({
        value: toolSnap,
        enabled: progressHydrated,
        delayMs: toolSaveDelayMs,
        serialize: snapKey,
        commit: async (latest) => {
            await commitToolToProgress(latest);
        },
    });

    const flushLatest = useCallback(async () => {
        cancel();

        const latest = latestSnapRef.current;
        prime(latest);
        await commitToolToProgress(latest);
    }, [cancel, prime, commitToolToProgress]);

    useEffect(() => {
        clearBoundState();
    }, [viewTid, clearBoundState]);

    const lastVersionRef = useRef<string | null>(null);

    useEffect(() => {
        if (!progressHydrated) return;

        if (lastVersionRef.current == null) {
            lastVersionRef.current = versionStr;
            return;
        }

        if (lastVersionRef.current !== versionStr) {
            clearBoundState();
        }

        lastVersionRef.current = versionStr;
    }, [progressHydrated, versionStr, clearBoundState]);

    useEffect(() => {
        if (!progressHydrated) return;
        if (boundRef.current) return;

        const s = (progress as any)?.topics?.[viewTid]?.toolState?.[toolKey] ?? null;

        const nextLang = (s?.lang as CodeLanguage) ?? defaultLang;
        const nextCode = typeof s?.code === "string" ? s.code : defaultCode;
        const nextStdin = typeof s?.stdin === "string" ? s.stdin : defaultStdin;
        const nextSqlDialect = (s?.sqlDialect as SqlDialect) ?? defaultSqlDialect;

        const nextSnap: ToolSnap = {
            lang: nextLang,
            code: nextCode,
            stdin: nextStdin,
            sqlDialect: nextSqlDialect,
        };

        latestSnapRef.current = nextSnap;

        setToolLang0((prev) => (prev === nextSnap.lang ? prev : nextSnap.lang));
        setToolCode0((prev) => (prev === nextSnap.code ? prev : nextSnap.code));
        setToolStdin0((prev) => (prev === nextSnap.stdin ? prev : nextSnap.stdin));
        setToolSqlDialect0((prev) => (prev === nextSnap.sqlDialect ? prev : nextSnap.sqlDialect));

        prime(nextSnap);
    }, [
        viewTid,
        progressHydrated,
        versionStr,
        toolKey,
        progress,
        defaultLang,
        defaultCode,
        defaultStdin,
        defaultSqlDialect,
        prime,
    ]);

    const bindCodeInput = useCallback(
        (args2: {
            id: string;
            lang: CodeLanguage;
            code: string;
            stdin?: string;
            sqlDialect?: SqlDialect;
            onPatch: (patch: any) => void;
        }) => {
            boundRef.current = { id: args2.id, onPatch: args2.onPatch };
            setBoundId((prev) => (prev === args2.id ? prev : args2.id));

            const nextSnap: ToolSnap = {
                lang: args2.lang,
                code: typeof args2.code === "string" ? args2.code : "",
                stdin: typeof args2.stdin === "string" ? args2.stdin : "",
                sqlDialect: args2.sqlDialect ?? defaultSqlDialect,
            };

            // incoming bind payload is authoritative
            boundDirtyRef.current = false;
            latestSnapRef.current = nextSnap;

            setToolLang0((prev) => (prev === nextSnap.lang ? prev : nextSnap.lang));
            setToolCode0((prev) => (prev === nextSnap.code ? prev : nextSnap.code));
            setToolStdin0((prev) => (prev === nextSnap.stdin ? prev : nextSnap.stdin));
            setToolSqlDialect0((prev) =>
                prev === nextSnap.sqlDialect ? prev : nextSnap.sqlDialect
            );

            prime(nextSnap);
        },
        [prime, defaultSqlDialect],
    );

    const unbindCodeInput = useCallback(() => {
        cancel();
        clearBoundState();
    }, [cancel, clearBoundState]);

    useFlushOnPageExit(() => {
        cancel();
        void flushLatest();
    }, progressHydrated);

    useEffect(() => {
        return () => {
            cancel();
            void flushLatest();
        };
    }, [cancel, flushLatest]);

    const setToolLang = useCallback((l: CodeLanguage) => {
        latestSnapRef.current = {
            ...latestSnapRef.current,
            lang: l,
        };

        setToolLang0((prev) => (prev === l ? prev : l));

        const b = boundRef.current;
        if (b) {
            boundDirtyRef.current = true;
            b.onPatch({ codeLang: l, submitted: false, result: null });
        }
    }, []);

    const setToolCode = useCallback((c: string) => {
        latestSnapRef.current = {
            ...latestSnapRef.current,
            code: c,
        };

        setToolCode0((prev) => (prev === c ? prev : c));

        const b = boundRef.current;
        if (b) {
            boundDirtyRef.current = true;
            b.onPatch({ code: c, submitted: false, result: null });
        }
    }, []);

    const setToolStdin = useCallback((s: string) => {
        latestSnapRef.current = {
            ...latestSnapRef.current,
            stdin: s,
        };

        setToolStdin0((prev) => (prev === s ? prev : s));

        const b = boundRef.current;
        if (b) {
            boundDirtyRef.current = true;
            b.onPatch({ codeStdin: s, submitted: false, result: null });
        }
    }, []);

    const setToolSqlDialect = useCallback((d: SqlDialect) => {
        latestSnapRef.current = {
            ...latestSnapRef.current,
            sqlDialect: d,
        };

        setToolSqlDialect0((prev) => (prev === d ? prev : d));

        const b = boundRef.current;
        if (b) {
            boundDirtyRef.current = true;
            b.onPatch({ codeSqlDialect: d, submitted: false, result: null });
        }
    }, []);

    const rightBodyRef = useRef<HTMLDivElement | null>(null);
    const [rightBodyH, setRightBodyH] = useState(520);

    useEffect(() => {
        if (rightCollapsed) return;

        const el = rightBodyRef.current;
        if (!el) return;

        const update = () => setRightBodyH(el.clientHeight - 100 || 520);
        update();

        if (typeof ResizeObserver === "undefined") return;

        const ro = new ResizeObserver(() => update());
        ro.observe(el);

        return () => ro.disconnect();
    }, [rightCollapsed, rightW]);

    const codeRunnerRegionH = Math.max(280, rightBodyH);

    return {
        boundId,
        isBound,
        bindCodeInput,
        unbindCodeInput,

        toolLang,
        toolCode,
        toolStdin,
        toolSqlDialect,

        setToolLang,
        setToolCode,
        setToolStdin,
        setToolSqlDialect,

        rightBodyRef,
        codeRunnerRegionH,

        flush,
        flushLatest,
    };
}