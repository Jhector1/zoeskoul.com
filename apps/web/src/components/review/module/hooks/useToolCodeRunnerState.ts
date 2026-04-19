"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkspaceLanguage, SqlDialect } from "@/lib/practice/types";
import { useDebouncedCommit } from "@/lib/client/persistence/useDebouncedCommit";
import { useFlushOnPageExit } from "@/lib/client/persistence/useFlushOnPageExit";
import { DEFAULT_SQL_DIALECT } from "@/components/code/runner/constants";
import {
    resolveSqlRunnerConfig,
    type SqlTableSnapshots,
} from "@/lib/subjects/sql/runtime/resolveSqlRunnerConfig";

type BoundTarget = { id: string; onPatch: (patch: any) => void };

type ToolSnap = {
    lang: WorkspaceLanguage;
    code: string;
    stdin: string;

    sqlDialect: SqlDialect;
    sqlDatasetId?: string;

    sqlSchemaSql?: string;
    sqlSeedSql?: string;
    sqlInitialTableSnapshots?: SqlTableSnapshots;
};

function snapKey(s: ToolSnap) {
    return [
        s.lang,
        s.sqlDialect,
        s.sqlDatasetId ?? "",
        s.stdin,
        s.code,
        s.sqlSchemaSql ?? "",
        s.sqlSeedSql ?? "",
        JSON.stringify(s.sqlInitialTableSnapshots ?? {}),
    ].join("::");
}

export function useToolCodeRunnerState(args: {
    progress: any;
    progressHydrated: boolean;
    setProgress: (updater: any) => void;
    viewTid: string;

    toolKey?: string;
    defaultLang?: WorkspaceLanguage;
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
        defaultCode = `print("Hello World!")`,
        defaultStdin = "",
        defaultSqlDialect = DEFAULT_SQL_DIALECT,
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
    const lastBindKeyRef = useRef<string>("");
    const isBound = useCallback((id: string) => boundRef.current?.id === id, []);

    const clearBoundState = useCallback(() => {
        boundRef.current = null;
        boundDirtyRef.current = false;
        lastBindKeyRef.current = "";
        setBoundId((prev) => (prev === null ? prev : null));
    }, []);

    const saved = useMemo(() => {
        return (progress as any)?.topics?.[viewTid]?.toolState?.[toolKey] ?? null;
    }, [progress, viewTid, toolKey]);


    const initialLang = (saved?.lang as WorkspaceLanguage) ?? defaultLang;
    const initialCode = typeof saved?.code === "string" ? saved.code : defaultCode;
    const initialStdin = typeof saved?.stdin === "string" ? saved.stdin : defaultStdin;

    const initialResolvedSql = resolveSqlRunnerConfig({
        language: initialLang,
        sqlDialect: (saved?.sqlDialect as SqlDialect) ?? defaultSqlDialect,
        sqlDatasetId:
            typeof saved?.sqlDatasetId === "string" ? saved.sqlDatasetId : undefined,
        sqlSchemaSql:
            typeof saved?.sqlSchemaSql === "string" ? saved.sqlSchemaSql : undefined,
        sqlSeedSql:
            typeof saved?.sqlSeedSql === "string" ? saved.sqlSeedSql : undefined,
        sqlInitialTableSnapshots:
            saved?.sqlInitialTableSnapshots && typeof saved.sqlInitialTableSnapshots === "object"
                ? (saved.sqlInitialTableSnapshots as SqlTableSnapshots)
                : undefined,
        defaultSqlDialect,
    });

    const [toolLang, setToolLang0] = useState<WorkspaceLanguage>(initialLang);
    const [toolCode, setToolCode0] = useState<string>(initialCode);
    const [toolStdin, setToolStdin0] = useState<string>(initialStdin);

    const [toolSqlDialect, setToolSqlDialect0] =
        useState<SqlDialect>(initialResolvedSql.sqlDialect);
    const [toolSqlDatasetId, setToolSqlDatasetId0] =
        useState<string | undefined>(initialResolvedSql.sqlDatasetId);

    const [toolSqlSchemaSql, setToolSqlSchemaSql0] =
        useState<string | undefined>(initialResolvedSql.sqlSchemaSql);
    const [toolSqlSeedSql, setToolSqlSeedSql0] =
        useState<string | undefined>(initialResolvedSql.sqlSeedSql);
    const [toolSqlInitialTableSnapshots, setToolSqlInitialTableSnapshots0] =
        useState<SqlTableSnapshots | undefined>(initialResolvedSql.sqlInitialTableSnapshots);

    const latestSnapRef = useRef<ToolSnap>({
        lang: initialLang,
        code: initialCode,
        stdin: initialStdin,
        sqlDialect: initialResolvedSql.sqlDialect,
        sqlDatasetId: initialResolvedSql.sqlDatasetId,
        sqlSchemaSql: initialResolvedSql.sqlSchemaSql,
        sqlSeedSql: initialResolvedSql.sqlSeedSql,
        sqlInitialTableSnapshots: initialResolvedSql.sqlInitialTableSnapshots,
    });

    const toolSnap = useMemo<ToolSnap>(
        () => ({
            lang: toolLang,
            code: toolCode,
            stdin: toolStdin,
            sqlDialect: toolSqlDialect,
            sqlDatasetId: toolSqlDatasetId,
            sqlSchemaSql: toolSqlSchemaSql,
            sqlSeedSql: toolSqlSeedSql,
            sqlInitialTableSnapshots: toolSqlInitialTableSnapshots,
        }),
        [
            toolLang,
            toolCode,
            toolStdin,
            toolSqlDialect,
            toolSqlDatasetId,
            toolSqlSchemaSql,
            toolSqlSeedSql,
            toolSqlInitialTableSnapshots,
        ],
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
                    prevToolState?.sqlDialect === latest.sqlDialect &&
                    prevToolState?.sqlDatasetId === latest.sqlDatasetId &&
                    prevToolState?.sqlSchemaSql === latest.sqlSchemaSql &&
                    prevToolState?.sqlSeedSql === latest.sqlSeedSql &&
                    JSON.stringify(prevToolState?.sqlInitialTableSnapshots ?? {}) ===
                    JSON.stringify(latest.sqlInitialTableSnapshots ?? {})
                ) {
                    return p;
                }

                const toolState = { ...(tp0.toolState ?? {}) };
                toolState[toolKey] = {
                    lang: latest.lang,
                    code: latest.code,
                    stdin: latest.stdin,
                    sqlDialect: latest.sqlDialect,
                    sqlDatasetId: latest.sqlDatasetId,
                    sqlSchemaSql: latest.sqlSchemaSql,
                    sqlSeedSql: latest.sqlSeedSql,
                    sqlInitialTableSnapshots: latest.sqlInitialTableSnapshots,
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

        const nextLang = (s?.lang as WorkspaceLanguage) ?? defaultLang;
        const nextCode = typeof s?.code === "string" ? s.code : defaultCode;
        const nextStdin = typeof s?.stdin === "string" ? s.stdin : defaultStdin;

        const resolvedSql = resolveSqlRunnerConfig({
            language: nextLang,
            sqlDialect: (s?.sqlDialect as SqlDialect) ?? defaultSqlDialect,
            sqlDatasetId:
                typeof s?.sqlDatasetId === "string" ? s.sqlDatasetId : undefined,
            sqlSchemaSql:
                typeof s?.sqlSchemaSql === "string" ? s.sqlSchemaSql : undefined,
            sqlSeedSql:
                typeof s?.sqlSeedSql === "string" ? s.sqlSeedSql : undefined,
            sqlInitialTableSnapshots:
                s?.sqlInitialTableSnapshots && typeof s.sqlInitialTableSnapshots === "object"
                    ? (s.sqlInitialTableSnapshots as SqlTableSnapshots)
                    : undefined,
            defaultSqlDialect,
        });

        const nextSnap: ToolSnap = {
            lang: nextLang,
            code: nextCode,
            stdin: nextStdin,
            sqlDialect: resolvedSql.sqlDialect,
            sqlDatasetId: resolvedSql.sqlDatasetId,
            sqlSchemaSql: resolvedSql.sqlSchemaSql,
            sqlSeedSql: resolvedSql.sqlSeedSql,
            sqlInitialTableSnapshots: resolvedSql.sqlInitialTableSnapshots,
        };

        latestSnapRef.current = nextSnap;

        setToolLang0((prev) => (prev === nextSnap.lang ? prev : nextSnap.lang));
        setToolCode0((prev) => (prev === nextSnap.code ? prev : nextSnap.code));
        setToolStdin0((prev) => (prev === nextSnap.stdin ? prev : nextSnap.stdin));
        setToolSqlDialect0((prev) =>
            prev === nextSnap.sqlDialect ? prev : nextSnap.sqlDialect,
        );
        setToolSqlDatasetId0((prev) =>
            prev === nextSnap.sqlDatasetId ? prev : nextSnap.sqlDatasetId,
        );
        setToolSqlSchemaSql0((prev) =>
            prev === nextSnap.sqlSchemaSql ? prev : nextSnap.sqlSchemaSql,
        );
        setToolSqlSeedSql0((prev) =>
            prev === nextSnap.sqlSeedSql ? prev : nextSnap.sqlSeedSql,
        );
        setToolSqlInitialTableSnapshots0((prev) =>
            JSON.stringify(prev ?? {}) === JSON.stringify(nextSnap.sqlInitialTableSnapshots ?? {})
                ? prev
                : nextSnap.sqlInitialTableSnapshots,
        );

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
            lang: WorkspaceLanguage;
            code: string;
            stdin?: string;
            sqlDialect?: SqlDialect;
            sqlDatasetId?: string;
            sqlSchemaSql?: string;
            sqlSeedSql?: string;
            sqlInitialTableSnapshots?: SqlTableSnapshots;
            onPatch: (patch: any) => void;
        }) => {
            const resolvedSql = resolveSqlRunnerConfig({
                language: args2.lang,
                sqlDialect: args2.sqlDialect ?? defaultSqlDialect,
                sqlDatasetId: args2.sqlDatasetId,
                sqlSchemaSql: args2.sqlSchemaSql,
                sqlSeedSql: args2.sqlSeedSql,
                sqlInitialTableSnapshots: args2.sqlInitialTableSnapshots,
                defaultSqlDialect,
            });

            const nextSnap: ToolSnap = {
                lang: args2.lang,
                code: typeof args2.code === "string" ? args2.code : "",
                stdin: typeof args2.stdin === "string" ? args2.stdin : "",
                sqlDialect: resolvedSql.sqlDialect,
                sqlDatasetId: resolvedSql.sqlDatasetId,
                sqlSchemaSql: resolvedSql.sqlSchemaSql,
                sqlSeedSql: resolvedSql.sqlSeedSql,
                sqlInitialTableSnapshots: resolvedSql.sqlInitialTableSnapshots,
            };

            const nextBindKey = `${args2.id}::${snapKey(nextSnap)}`;

            if (lastBindKeyRef.current === nextBindKey) {
                boundRef.current = { id: args2.id, onPatch: args2.onPatch };
                return;
            }

            lastBindKeyRef.current = nextBindKey;
            boundRef.current = { id: args2.id, onPatch: args2.onPatch };
            setBoundId((prev) => (prev === args2.id ? prev : args2.id));

            boundDirtyRef.current = false;
            latestSnapRef.current = nextSnap;

            setToolLang0((prev) => (prev === nextSnap.lang ? prev : nextSnap.lang));
            setToolCode0((prev) => (prev === nextSnap.code ? prev : nextSnap.code));
            setToolStdin0((prev) => (prev === nextSnap.stdin ? prev : nextSnap.stdin));
            setToolSqlDialect0((prev) =>
                prev === nextSnap.sqlDialect ? prev : nextSnap.sqlDialect,
            );
            setToolSqlDatasetId0((prev) =>
                prev === nextSnap.sqlDatasetId ? prev : nextSnap.sqlDatasetId,
            );
            setToolSqlSchemaSql0((prev) =>
                prev === nextSnap.sqlSchemaSql ? prev : nextSnap.sqlSchemaSql,
            );
            setToolSqlSeedSql0((prev) =>
                prev === nextSnap.sqlSeedSql ? prev : nextSnap.sqlSeedSql,
            );
            setToolSqlInitialTableSnapshots0((prev) =>
                JSON.stringify(prev ?? {}) === JSON.stringify(nextSnap.sqlInitialTableSnapshots ?? {})
                    ? prev
                    : nextSnap.sqlInitialTableSnapshots,
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

    const setToolLang = useCallback((l: WorkspaceLanguage) => {
        latestSnapRef.current = { ...latestSnapRef.current, lang: l };
        setToolLang0((prev) => (prev === l ? prev : l));

        const b = boundRef.current;
        if (b) {
            boundDirtyRef.current = true;
            b.onPatch({ codeLang: l, submitted: false, result: null });
        }
    }, []);

    const setToolCode = useCallback((c: string) => {
        latestSnapRef.current = { ...latestSnapRef.current, code: c };
        setToolCode0((prev) => (prev === c ? prev : c));

        const b = boundRef.current;
        if (b) {
            boundDirtyRef.current = true;
            b.onPatch({ code: c, submitted: false, result: null });
        }
    }, []);

    const setToolStdin = useCallback((s: string) => {
        latestSnapRef.current = { ...latestSnapRef.current, stdin: s };
        setToolStdin0((prev) => (prev === s ? prev : s));

        const b = boundRef.current;
        if (b) {
            boundDirtyRef.current = true;
            b.onPatch({ codeStdin: s, submitted: false, result: null });
        }
    }, []);

    const setToolSqlDialect = useCallback((d: SqlDialect) => {
        latestSnapRef.current = { ...latestSnapRef.current, sqlDialect: d };
        setToolSqlDialect0((prev) => (prev === d ? prev : d));

        const b = boundRef.current;
        if (b) {
            boundDirtyRef.current = true;
            b.onPatch({ codeSqlDialect: d, submitted: false, result: null });
        }
    }, []);

    const resolvedSql = useMemo(() => {
        return resolveSqlRunnerConfig({
            language: toolLang,
            sqlDialect: toolSqlDialect,
            sqlDatasetId: toolSqlDatasetId,
            sqlSchemaSql: toolSqlSchemaSql,
            sqlSeedSql: toolSqlSeedSql,
            sqlInitialTableSnapshots: toolSqlInitialTableSnapshots,
            defaultSqlDialect,
        });
    }, [
        toolLang,
        toolSqlDialect,
        toolSqlDatasetId,
        toolSqlSchemaSql,
        toolSqlSeedSql,
        toolSqlInitialTableSnapshots,
        defaultSqlDialect,
    ]);

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

        toolSqlDialect: resolvedSql.sqlDialect,
        toolSqlDatasetId,
        toolSqlSchemaSql: resolvedSql.sqlSchemaSql,
        toolSqlSeedSql: resolvedSql.sqlSeedSql,
        toolSqlInitialTableSnapshots: resolvedSql.sqlInitialTableSnapshots,

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