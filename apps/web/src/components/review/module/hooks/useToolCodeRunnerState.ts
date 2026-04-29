"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkspaceStateV2 } from "@/components/ide/types";
import type { WorkspaceLanguage, SqlDialect } from "@/lib/practice/types";
import { useDebouncedCommit } from "@/lib/client/persistence/useDebouncedCommit";
import { useFlushOnPageExit } from "@/lib/client/persistence/useFlushOnPageExit";
import { DEFAULT_SQL_DIALECT } from "@/components/code/runner/constants";
import {
    resolveSqlRunnerConfig,
    type SqlTableSnapshots,
} from "@/lib/subjects/sql/runtime/resolveSqlRunnerConfig";
import type { LearningIdeConfig } from "@/lib/ide/learningIdeConfig";

type BoundTarget = { id: string; onPatch: (patch: any) => void };

type ToolSnap = {
    topicId: string;
    toolKey: string;

    lang: WorkspaceLanguage;
    code: string;
    stdin: string;
    workspace?: WorkspaceStateV2 | null;
    workspaceKey: string;

    sqlDialect: SqlDialect;
    sqlDatasetId?: string;

    sqlSchemaSql?: string;
    sqlSeedSql?: string;
    sqlInitialTableSnapshots?: SqlTableSnapshots;
};

function snapKey(s: ToolSnap) {
    return [
        s.topicId,
        s.toolKey,
        s.lang,
        s.sqlDialect,
        s.sqlDatasetId ?? "",
        s.stdin,
        s.code,
        s.workspaceKey,
        s.sqlSchemaSql ?? "",
        s.sqlSeedSql ?? "",
        JSON.stringify(s.sqlInitialTableSnapshots ?? {}),
    ].join("::");
}

function workspaceKeyOf(workspace: WorkspaceStateV2 | null | undefined) {
    return JSON.stringify(workspace ?? null);
}

function ideConfigKey(config: LearningIdeConfig | null | undefined) {
    return JSON.stringify(config ?? null);
}

export function useToolCodeRunnerState(args: {
    progress: any;
    progressHydrated: boolean;
    setProgress: (updater: any) => void;
    viewTid: string;

    scopeKey?: string;
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
        scopeKey = "card:general",
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

    const effectiveToolKey = boundId ? `exercise:${boundId}` : scopeKey;
    const toolIdentity = useMemo(
        () => `${viewTid}::${effectiveToolKey}::${versionStr}`,
        [viewTid, effectiveToolKey, versionStr],
    );

    const saved = useMemo(() => {
        return (progress as any)?.topics?.[viewTid]?.toolState?.[effectiveToolKey] ?? null;
    }, [progress, viewTid, effectiveToolKey]);

    const initialLang = (saved?.lang as WorkspaceLanguage) ?? defaultLang;
    const initialCode = typeof saved?.code === "string" ? saved.code : defaultCode;
    const initialStdin = typeof saved?.stdin === "string" ? saved.stdin : defaultStdin;
    const initialWorkspace =
        saved?.workspace && typeof saved.workspace === "object"
            ? (saved.workspace as WorkspaceStateV2)
            : null;
    const initialWorkspaceKey = workspaceKeyOf(initialWorkspace);

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
    const [toolWorkspace, setToolWorkspace0] = useState<WorkspaceStateV2 | null>(initialWorkspace);
    const [toolWorkspaceKey, setToolWorkspaceKey] = useState<string>(initialWorkspaceKey);
    const toolWorkspaceKeyRef = useRef(initialWorkspaceKey);

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

    const [toolIdeConfig, setToolIdeConfig0] = useState<LearningIdeConfig | null>(null);
    const toolIdeConfigKeyRef = useRef<string>(ideConfigKey(null));
    const [hydratedToolIdentity, setHydratedToolIdentity] = useState<string>("");
    const toolHydrated = hydratedToolIdentity === toolIdentity;

    const setToolIdeConfigIfChanged = useCallback((config: LearningIdeConfig | null | undefined) => {
        const nextConfig = config ?? null;
        const nextKey = ideConfigKey(nextConfig);
        if (toolIdeConfigKeyRef.current === nextKey) return;
        toolIdeConfigKeyRef.current = nextKey;
        setToolIdeConfig0(nextConfig);
    }, []);

    useEffect(() => {
        if (boundId == null) {
            setToolIdeConfigIfChanged(null);
        }
    }, [boundId, setToolIdeConfigIfChanged]);

    const latestSnapRef = useRef<ToolSnap>({
        topicId: viewTid,
        toolKey: effectiveToolKey,
        lang: initialLang,
        code: initialCode,
        stdin: initialStdin,
        workspace: initialWorkspace,
        workspaceKey: initialWorkspaceKey,
        sqlDialect: initialResolvedSql.sqlDialect,
        sqlDatasetId: initialResolvedSql.sqlDatasetId,
        sqlSchemaSql: initialResolvedSql.sqlSchemaSql,
        sqlSeedSql: initialResolvedSql.sqlSeedSql,
        sqlInitialTableSnapshots: initialResolvedSql.sqlInitialTableSnapshots,
    });

    const toolSnap = useMemo<ToolSnap>(
        () => ({
            topicId: viewTid,
            toolKey: effectiveToolKey,
            lang: toolLang,
            code: toolCode,
            stdin: toolStdin,
            workspace: toolWorkspace,
            workspaceKey: toolWorkspaceKey,
            sqlDialect: toolSqlDialect,
            sqlDatasetId: toolSqlDatasetId,
            sqlSchemaSql: toolSqlSchemaSql,
            sqlSeedSql: toolSqlSeedSql,
            sqlInitialTableSnapshots: toolSqlInitialTableSnapshots,
        }),
        [
            viewTid,
            effectiveToolKey,
            toolLang,
            toolCode,
            toolStdin,
            toolWorkspace,
            toolWorkspaceKey,
            toolSqlDialect,
            toolSqlDatasetId,
            toolSqlSchemaSql,
            toolSqlSeedSql,
            toolSqlInitialTableSnapshots,
        ],
    );

    const commitToolToProgress = useCallback(
        async (latest: ToolSnap) => {
            const topicId = latest.topicId;
            const toolKey = latest.toolKey;
            if (!topicId || !toolKey) return;

            setProgress((p: any) => {
                const tp0: any = p?.topics?.[topicId] ?? {};
                const prevToolState = tp0?.toolState?.[toolKey] ?? null;

                if (
                    prevToolState?.lang === latest.lang &&
                    prevToolState?.code === latest.code &&
                    prevToolState?.stdin === latest.stdin &&
                    workspaceKeyOf(prevToolState?.workspace ?? null) === latest.workspaceKey &&
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
                    workspace: latest.workspace ?? null,
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
                        [topicId]: { ...tp0, toolState },
                    },
                };
            });
        },
        [setProgress],
    );

    const { prime, flush, cancel } = useDebouncedCommit({
        value: toolSnap,
        enabled: progressHydrated && toolHydrated,
        delayMs: toolSaveDelayMs,
        serialize: snapKey,
        commit: async (latest) => {
            await commitToolToProgress(latest);
        },
    });

    const flushLatest = useCallback(async () => {
        cancel();

        const latest = latestSnapRef.current;
        if (!progressHydrated) return;
        if (`${latest.topicId}::${latest.toolKey}::${versionStr}` !== toolIdentity) return;

        prime(latest);
        await commitToolToProgress(latest);
    }, [cancel, prime, commitToolToProgress, progressHydrated, toolIdentity, versionStr]);

    useEffect(() => {
        clearBoundState();
    }, [viewTid, scopeKey, clearBoundState]);

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

        const s = (progress as any)?.topics?.[viewTid]?.toolState?.[effectiveToolKey] ?? null;

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

        const nextWorkspace =
            s?.workspace && typeof s.workspace === "object"
                ? (s.workspace as WorkspaceStateV2)
                : null;

        const nextSnap: ToolSnap = {
            topicId: viewTid,
            toolKey: effectiveToolKey,
            lang: nextLang,
            code: nextCode,
            stdin: nextStdin,
            workspace: nextWorkspace,
            workspaceKey: workspaceKeyOf(nextWorkspace),
            sqlDialect: resolvedSql.sqlDialect,
            sqlDatasetId: resolvedSql.sqlDatasetId,
            sqlSchemaSql: resolvedSql.sqlSchemaSql,
            sqlSeedSql: resolvedSql.sqlSeedSql,
            sqlInitialTableSnapshots: resolvedSql.sqlInitialTableSnapshots,
        };

        const latest = latestSnapRef.current;
        const latestIdentity = `${latest.topicId}::${latest.toolKey}::${versionStr}`;
        const hasUnsavedLocalEdits =
            hydratedToolIdentity === toolIdentity &&
            latestIdentity === toolIdentity &&
            snapKey(latest) !== snapKey(nextSnap);

        if (hasUnsavedLocalEdits) {
            return;
        }

        latestSnapRef.current = nextSnap;
        setHydratedToolIdentity(toolIdentity);

        setToolLang0((prev) => (prev === nextSnap.lang ? prev : nextSnap.lang));
        setToolCode0((prev) => (prev === nextSnap.code ? prev : nextSnap.code));
        setToolStdin0((prev) => (prev === nextSnap.stdin ? prev : nextSnap.stdin));
        setToolWorkspace0((prev) => (
            toolWorkspaceKeyRef.current === nextSnap.workspaceKey
                ? prev
                : (nextSnap.workspace ?? null)
        ));
        if (toolWorkspaceKeyRef.current !== nextSnap.workspaceKey) {
            toolWorkspaceKeyRef.current = nextSnap.workspaceKey;
            setToolWorkspaceKey(nextSnap.workspaceKey);
        }
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
        effectiveToolKey,
        toolIdentity,
        progress,
        defaultLang,
        defaultCode,
        defaultStdin,
        defaultSqlDialect,
        prime,
        hydratedToolIdentity,
    ]);

    const bindCodeInput = useCallback(
        (args2: {
            id: string;
            lang: WorkspaceLanguage;
            code: string;
            stdin?: string;
            ideConfig?: LearningIdeConfig | null;
            workspace?: WorkspaceStateV2 | null;
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

            const nextWorkspace = args2.workspace ?? null;
            const nextToolKey = `exercise:${args2.id}`;
            const nextIdentity = `${viewTid}::${nextToolKey}::${versionStr}`;
            const savedForBind =
                (progress as any)?.topics?.[viewTid]?.toolState?.[nextToolKey] ?? null;
            const savedWorkspace =
                savedForBind?.workspace && typeof savedForBind.workspace === "object"
                    ? (savedForBind.workspace as WorkspaceStateV2)
                    : null;

            const nextSnap: ToolSnap = {
                topicId: viewTid,
                toolKey: nextToolKey,
                lang: (savedForBind?.lang as WorkspaceLanguage) ?? args2.lang,
                code:
                    typeof savedForBind?.code === "string"
                        ? savedForBind.code
                        : typeof args2.code === "string"
                            ? args2.code
                            : "",
                stdin:
                    typeof savedForBind?.stdin === "string"
                        ? savedForBind.stdin
                        : typeof args2.stdin === "string"
                            ? args2.stdin
                            : "",
                workspace: savedWorkspace ?? nextWorkspace,
                workspaceKey: workspaceKeyOf(savedWorkspace ?? nextWorkspace),
                sqlDialect: (savedForBind?.sqlDialect as SqlDialect) ?? resolvedSql.sqlDialect,
                sqlDatasetId:
                    typeof savedForBind?.sqlDatasetId === "string"
                        ? savedForBind.sqlDatasetId
                        : resolvedSql.sqlDatasetId,
                sqlSchemaSql:
                    typeof savedForBind?.sqlSchemaSql === "string"
                        ? savedForBind.sqlSchemaSql
                        : resolvedSql.sqlSchemaSql,
                sqlSeedSql:
                    typeof savedForBind?.sqlSeedSql === "string"
                        ? savedForBind.sqlSeedSql
                        : resolvedSql.sqlSeedSql,
                sqlInitialTableSnapshots:
                    savedForBind?.sqlInitialTableSnapshots &&
                    typeof savedForBind.sqlInitialTableSnapshots === "object"
                        ? (savedForBind.sqlInitialTableSnapshots as SqlTableSnapshots)
                        : resolvedSql.sqlInitialTableSnapshots,
            };

            if (
                savedForBind &&
                (nextSnap.code !== args2.code ||
                    nextSnap.stdin !== (args2.stdin ?? "") ||
                    nextSnap.lang !== args2.lang)
            ) {
                args2.onPatch({
                    codeLang: nextSnap.lang,
                    code: nextSnap.code,
                    codeStdin: nextSnap.stdin,
                    submitted: false,
                    result: null,
                });
            }

            const nextBindKey = `${nextIdentity}::${args2.id}::${snapKey(nextSnap)}::${ideConfigKey(args2.ideConfig)}`;

            if (lastBindKeyRef.current === nextBindKey) {
                boundRef.current = { id: args2.id, onPatch: args2.onPatch };
                setToolIdeConfigIfChanged(args2.ideConfig ?? null);
                if (hydratedToolIdentity !== nextIdentity) setHydratedToolIdentity(nextIdentity);
                return;
            }

            lastBindKeyRef.current = nextBindKey;
            boundRef.current = { id: args2.id, onPatch: args2.onPatch };
            setBoundId((prev) => (prev === args2.id ? prev : args2.id));
            setToolIdeConfigIfChanged(args2.ideConfig ?? null);

            boundDirtyRef.current = false;
            latestSnapRef.current = nextSnap;
            setHydratedToolIdentity(nextIdentity);

            setToolLang0((prev) => (prev === nextSnap.lang ? prev : nextSnap.lang));
            setToolCode0((prev) => (prev === nextSnap.code ? prev : nextSnap.code));
            setToolStdin0((prev) => (prev === nextSnap.stdin ? prev : nextSnap.stdin));
            setToolWorkspace0((prev) => (
                toolWorkspaceKeyRef.current === nextSnap.workspaceKey
                    ? prev
                    : (nextSnap.workspace ?? null)
            ));
            if (toolWorkspaceKeyRef.current !== nextSnap.workspaceKey) {
                toolWorkspaceKeyRef.current = nextSnap.workspaceKey;
                setToolWorkspaceKey(nextSnap.workspaceKey);
            }
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
        [
            prime,
            defaultSqlDialect,
            setToolIdeConfigIfChanged,
            viewTid,
            versionStr,
            hydratedToolIdentity,
            progress,
        ],
    );

    const unbindCodeInput = useCallback(() => {
        cancel();
        clearBoundState();
        setToolIdeConfigIfChanged(null);
    }, [cancel, clearBoundState, setToolIdeConfigIfChanged]);

    useFlushOnPageExit(() => {
        cancel();
        void flushLatest();
    }, progressHydrated);

    useEffect(() => {
        return () => {
            cancel();
            const latest = latestSnapRef.current;
            if (
                progressHydrated &&
                toolHydrated &&
                `${latest.topicId}::${latest.toolKey}::${versionStr}` === toolIdentity
            ) {
                void commitToolToProgress(latest);
            }
        };
    }, [toolIdentity, versionStr, progressHydrated, toolHydrated, cancel, commitToolToProgress]);

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

    const setToolWorkspace = useCallback((workspace: WorkspaceStateV2 | null) => {
        const nextWorkspaceKey = workspaceKeyOf(workspace);
        latestSnapRef.current = {
            ...latestSnapRef.current,
            workspace,
            workspaceKey: nextWorkspaceKey,
        };
        if (toolWorkspaceKeyRef.current === nextWorkspaceKey) return;

        toolWorkspaceKeyRef.current = nextWorkspaceKey;
        setToolWorkspace0(workspace);
        setToolWorkspaceKey(nextWorkspaceKey);
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

        let raf = 0;
        const update = () => {
            if (raf) window.cancelAnimationFrame(raf);
            raf = window.requestAnimationFrame(() => {
                raf = 0;
                const next = Math.max(280, el.clientHeight - 100 || 520);
                setRightBodyH((prev) => (Math.abs(prev - next) < 1 ? prev : next));
            });
        };
        update();

        if (typeof ResizeObserver === "undefined") {
            return () => {
                if (raf) window.cancelAnimationFrame(raf);
            };
        }

        const ro = new ResizeObserver(() => update());
        ro.observe(el);

        return () => {
            if (raf) window.cancelAnimationFrame(raf);
            ro.disconnect();
        };
    }, [rightCollapsed, rightW]);

    const codeRunnerRegionH = Math.max(280, rightBodyH);
    const displayHydrated = toolHydrated;

    return {
        boundId,
        isBound,
        bindCodeInput,
        unbindCodeInput,

        toolLang: displayHydrated ? toolLang : initialLang,
        toolCode: displayHydrated ? toolCode : initialCode,
        toolStdin: displayHydrated ? toolStdin : initialStdin,
        toolWorkspace: displayHydrated ? toolWorkspace : initialWorkspace,

        toolSqlDialect: displayHydrated ? resolvedSql.sqlDialect : initialResolvedSql.sqlDialect,
        toolSqlDatasetId: displayHydrated ? toolSqlDatasetId : initialResolvedSql.sqlDatasetId,
        toolSqlSchemaSql: displayHydrated
            ? resolvedSql.sqlSchemaSql
            : initialResolvedSql.sqlSchemaSql,
        toolSqlSeedSql: displayHydrated
            ? resolvedSql.sqlSeedSql
            : initialResolvedSql.sqlSeedSql,
        toolSqlInitialTableSnapshots: displayHydrated
            ? resolvedSql.sqlInitialTableSnapshots
            : initialResolvedSql.sqlInitialTableSnapshots,
        toolIdeConfig,

        setToolLang,
        setToolCode,
        setToolStdin,
        setToolWorkspace,
        setToolSqlDialect,

        rightBodyRef,
        codeRunnerRegionH,

        flush,
        flushLatest,
    };
}
