"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { WorkspaceStateV2 } from "@/components/ide/types";
import type { SqlPaneOptions } from "@/components/code/runner/components/sql/results-pane";
import type { SqlDialect, WorkspaceLanguage } from "@/lib/practice/types";
import { useElementSize } from "@/components/tools/hooks/useElementSize";
import { pickRunFeedbackFromResult } from "@/lib/code/feedback";
import type { CodeFeedback } from "@/lib/code/feedback/types";
import CodeFeedbackCallout from "@/components/practice/kinds/CodeFeedbackCallout";
import { useReviewTools } from "@/components/review/module/context/ReviewToolsContext";
import { RunnerLanguage } from "@zoeskoul/code-contracts";
import {
    type LearningIdeConfig,
    resolveFullIDEConfigFromLearningIde,
} from "@/lib/ide/learningIdeConfig";
import { useReviewRuntimeStore } from "@/components/review/module/runtime/reviewRuntimeStore";
import { reviewSaveDebug, summarizeWorkspaceForSave } from "@/components/review/module/runtime/reviewSaveDebug";
import {languagesCompatible} from "@/components/review/module/utils";

const FullIDE = dynamic(() => import("@/components/ide/fullide/FullIDE"), {
    ssr: false,
    loading: () => null,
});

function reviewToolPaneDebugEnabled() {
    try {
        if (typeof window === "undefined") return process.env.NODE_ENV !== "production";
        return (
            window.localStorage.getItem("zoe:debug:review-save") === "1" ||
            window.localStorage.getItem("zoe:debug:starter-files") === "1"
        );
    } catch {
        return false;
    }
}

function starterPaneTrace(label: string, payload: Record<string, any>) {
    try {
        if (typeof window === "undefined") return;
        if (window.localStorage.getItem("zoe:debug:starter-files") !== "1") return;
    } catch {
        return;
    }

    const win = window as any;
    win.__ZOE_STARTER_LOOP__ ??= {
        seq: 0,
        counts: {},
        last: {},
        startedAt: Date.now(),
    };

    const store = win.__ZOE_STARTER_LOOP__;
    const key = String(
        payload.exerciseKey ??
        payload.cardRuntimeKey ??
        payload.workspaceContextKey ??
        payload.boundId ??
        "global",
    );

    const fingerprint = JSON.stringify({
        label,
        key,
        workspaceKey: payload.workspaceKey ?? payload.incomingWorkspaceKey ?? payload.currentWorkspaceKey ?? null,
        bridgeKey: payload.bridgeKey ?? null,
        canRenderEditor: payload.canRenderEditor ?? null,
        showLoadingMask: payload.showLoadingMask ?? null,
        patched: payload.patched ?? null,
        reason: payload.reason ?? null,
    });

    const counterKey = `${label}:${key}:${fingerprint}`;
    store.seq += 1;
    store.counts[counterKey] = (store.counts[counterKey] ?? 0) + 1;
    store.last[key] = {
        label,
        payload,
        fingerprint,
        seq: store.seq,
        count: store.counts[counterKey],
        at: Date.now(),
    };

    const count = store.counts[counterKey];
    const method = count > 10 ? "warn" : "debug";

    console[method](`[starter-loop:${label}] #${store.seq} count=${count}`, {
        key,
        ...payload,
        fingerprint,
    });

    if (count === 11) {
        console.warn("[starter-loop] repeated pane transition more than 10 times", {
            label,
            key,
            payload,
            inspect: "window.__ZOE_STARTER_LOOP__",
        });
    }
}



type ReviewWorkspaceDraft = {
    savedAt: number;
    workspace: WorkspaceStateV2;
};

function reviewWorkspaceDraftKey(ownerKey: string) {
    return `zoe:review-workspace-draft:${ownerKey}`;
}

function isWorkspaceState(value: unknown): value is WorkspaceStateV2 {
    return Boolean(
        value &&
        typeof value === "object" &&
        (value as any).version === 2 &&
        Array.isArray((value as any).nodes),
    );
}

function readReviewWorkspaceDraft(ownerKey: string | null | undefined): ReviewWorkspaceDraft | null {
    if (typeof window === "undefined") return null;
    const key = String(ownerKey ?? "").trim();
    if (!key) return null;

    try {
        const raw = window.localStorage.getItem(reviewWorkspaceDraftKey(key));
        if (!raw) return null;

        const parsed = JSON.parse(raw) as Partial<ReviewWorkspaceDraft>;
        if (!isWorkspaceState(parsed.workspace)) return null;

        const savedAt = Number(parsed.savedAt ?? 0);
        return {
            savedAt: Number.isFinite(savedAt) ? savedAt : 0,
            workspace: parsed.workspace,
        };
    } catch {
        return null;
    }
}

function writeReviewWorkspaceDraft(ownerKey: string | null | undefined, workspace: WorkspaceStateV2 | null) {
    if (typeof window === "undefined") return;
    const key = String(ownerKey ?? "").trim();
    if (!key || !workspace || !isWorkspaceState(workspace)) return;

    try {
        window.localStorage.setItem(
            reviewWorkspaceDraftKey(key),
            JSON.stringify({ savedAt: Date.now(), workspace } satisfies ReviewWorkspaceDraft),
        );
    } catch {
        // localStorage can be full/disabled. DB/runtime saving remains canonical.
    }
}

function workspaceFileCount(workspace: WorkspaceStateV2 | null | undefined) {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) return 0;
    return workspace.nodes.filter((node: any) => node?.kind === "file").length;
}

function shouldUseLocalReviewDraft(_args: {
    draft: ReviewWorkspaceDraft | null;
    runtimeWorkspace: WorkspaceStateV2 | null | undefined;
    runtimeUpdatedAt?: number | null;
    runtimeUserEdited?: boolean | null;
    runtimeOrigin?: string | null;
}) {
    /**
     * DB-canonical contract: never use localStorage to choose what appears in a
     * logged-in/review editor. Local drafts caused two computers opening the
     * same sketch to show different content because each browser could restore
     * its own stale copy before the DB copy won.
     *
     * The review progress row is the only source of truth. If it is empty, the
     * runtime resolver should seed from the lesson starter, not from a browser
     * draft.
     */
    return false;
}

function asWorkspaceLanguage(language: string | null | undefined): WorkspaceLanguage {
    const value = String(language ?? "");
    if (
        value === "python" ||
        value === "java" ||
        value === "javascript" ||
        value === "c" ||
        value === "cpp" ||
        value === "sql" ||
        value === "bash" ||
        value === "web"
    ) {
        return value as WorkspaceLanguage;
    }

    return "python";
}

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
function reviewWorkspaceHasNonEmptyFile(workspace: WorkspaceStateV2 | null | undefined) {
    return Boolean(
        workspace?.nodes?.some((node: any) => {
            if (node?.kind !== "file") return false;
            return String(node.content ?? "").trim().length > 0;
        }),
    );
}

function forceWorkspaceHasContent(workspace: WorkspaceStateV2 | null | undefined) {
    // Starter/review workspaces are authoritative. Any workspace with at least
    // one file node counts as content.
    return Boolean(workspace?.nodes?.some((node: any) => node?.kind === "file"));
}

function fastTextHash(value: string) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function workspaceKeyOf(workspace: WorkspaceStateV2 | null | undefined) {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return "null";
    }

    const folderPathById = new Map<string, string>();

    let changed = true;
    while (changed) {
        changed = false;

        for (const node of workspace.nodes as any[]) {
            if (!node || node.kind !== "folder") continue;

            const id = String(node.id ?? "");
            if (!id || folderPathById.has(id)) continue;

            const name = String(node.name ?? "");
            const parentId = node.parentId == null ? null : String(node.parentId);
            if (parentId && !folderPathById.has(parentId)) continue;

            const parentPath = parentId ? folderPathById.get(parentId) || "" : "";
            folderPathById.set(id, parentPath ? `${parentPath}/${name}` : name);
            changed = true;
        }
    }

    const filePath = (node: any) => {
        const name = String(node?.name ?? "");
        const parentId = node?.parentId == null ? null : String(node.parentId);
        const parentPath = parentId ? folderPathById.get(parentId) || "" : "";
        return parentPath ? `${parentPath}/${name}` : name;
    };

    const files = (workspace.nodes as any[])
        .filter((node) => node?.kind === "file")
        .map((node) => {
            const content = String(node.content ?? "");
            return {
                path: filePath(node),
                length: content.length,
                hash: fastTextHash(content),
            };
        })
        .sort((a, b) => a.path.localeCompare(b.path));

    const activeNode = (workspace.nodes as any[]).find(
        (node) => node?.kind === "file" && node.id === workspace.activeFileId,
    );
    const entryNode = (workspace.nodes as any[]).find(
        (node) => node?.kind === "file" && node.id === workspace.entryFileId,
    );

    return JSON.stringify({
        version: 2,
        language: workspace.language ?? null,
        stdin: typeof workspace.stdin === "string" ? `${workspace.stdin.length}:${fastTextHash(workspace.stdin)}` : "",
        activePath: activeNode ? filePath(activeNode) : null,
        entryPath: entryNode ? filePath(entryNode) : null,
        files,
    });
}



function workspaceStructureKeyOf(workspace: WorkspaceStateV2 | null | undefined) {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return "null";
    }

    const folderPathById = new Map<string, string>();

    let changed = true;
    while (changed) {
        changed = false;

        for (const node of workspace.nodes as any[]) {
            if (!node || node.kind !== "folder") continue;

            const id = String(node.id ?? "");
            if (!id || folderPathById.has(id)) continue;

            const name = String(node.name ?? "");
            const parentId = node.parentId == null ? null : String(node.parentId);
            if (parentId && !folderPathById.has(parentId)) continue;

            const parentPath = parentId ? folderPathById.get(parentId) || "" : "";
            folderPathById.set(id, parentPath ? `${parentPath}/${name}` : name);
            changed = true;
        }
    }

    const pathOf = (node: any) => {
        const name = String(node?.name ?? "");
        const parentId = node?.parentId == null ? null : String(node.parentId);
        const parentPath = parentId ? folderPathById.get(parentId) || "" : "";
        return parentPath ? `${parentPath}/${name}` : name;
    };

    const files = (workspace.nodes as any[])
        .filter((node) => node?.kind === "file")
        .map(pathOf)
        .sort((a, b) => a.localeCompare(b));

    const folders = (workspace.nodes as any[])
        .filter((node) => node?.kind === "folder")
        .map(pathOf)
        .sort((a, b) => a.localeCompare(b));

    const activeNode = (workspace.nodes as any[]).find(
        (node) => node?.kind === "file" && node.id === workspace.activeFileId,
    );
    const entryNode = (workspace.nodes as any[]).find(
        (node) => node?.kind === "file" && node.id === workspace.entryFileId,
    );

    return JSON.stringify({
        version: 2,
        language: workspace.language ?? null,
        activePath: activeNode ? pathOf(activeNode) : null,
        entryPath: entryNode ? pathOf(entryNode) : null,
        files,
        folders,
    });
}

function extractWorkspaceSnapshot(workspace: WorkspaceStateV2 | null) {
    if (!workspace) {
        return {
            code: "",
            stdin: "",
        };
    }

    const activeFile =
        workspace.nodes.find(
            (node) => node.kind === "file" && node.id === workspace.activeFileId,
        ) ??
        workspace.nodes.find(
            (node) => node.kind === "file" && node.id === workspace.entryFileId,
        ) ??
        workspace.nodes.find((node) => node.kind === "file") ??
        null;

    return {
        code: activeFile?.kind === "file" ? activeFile.content ?? "" : "",
        stdin: workspace.stdin ?? "",
    };
}

function isExerciseEditorScope(value: string | null | undefined) {
    if (!value) return false;
    if (value === "general") return false;
    if (value.startsWith("card:")) return false;
    if (value.endsWith(":general")) return false;
    if (value.includes(":card:general")) return false;
    if (value.startsWith("code-runner:")) return false;
    return value.split(":").length >= 5;
}

function isCardEditorScope(value: string | null | undefined) {
    if (!value) return false;

    const key = value.trim();
    if (!key) return false;

    // Explicit card/sketch runtime keys only.
    if (key.startsWith("card:")) return true;

    // Only treat it as a card scope if the key explicitly contains a card segment.
    // Do NOT treat every ":general" key as a sketch/card editor.
    if (key.includes(":card:")) return true;

    return false;
}

function isBindableEditorOwnerKey(value: string | null | undefined) {
    const key = String(value ?? "").trim();
    if (!key) return false;
    if (key === "general") return false;
    if (key === "not-bound") return false;
    if (key === "unbound") return false;
    if (key.startsWith("code-runner:")) return false;
    if (key.endsWith(":general") && !key.includes(":card:")) return false;
    return true;
}

export default function CodeToolPane(props: {
    height: number;
    editorOwnerKey?: string | null;
    toolScopeKey?: string;
    toolHydrated: boolean;
    toolLang: RunnerLanguage;
    toolCode: string;
    toolStdin: string;
    toolWorkspace?: WorkspaceStateV2 | null;
    onChangeCode: (c: string) => void;
    onChangeStdin: (s: string) => void;
    onChangeWorkspace?: (workspace: WorkspaceStateV2 | null) => void;
    onBeforeRun?: () => void | Promise<void>;
    ideConfig?: LearningIdeConfig | null;
    sqlDialect?: SqlDialect;
    sqlDatasetId?: string;
    sqlResultShape?: "table";
    sqlPaneOptions?: SqlPaneOptions;
    sqlSchemaSql?: string;
    sqlSeedSql?: string;
    sqlSetupSql?: string;
    sqlInitialTableSnapshots?: SqlTableSnapshots;
}) {
    const {
        toolScopeKey,
        editorOwnerKey,
        toolHydrated,
        toolLang,
        toolCode,
        toolStdin,
        toolWorkspace,
        onChangeCode,
        onChangeStdin,
        onChangeWorkspace,
        onBeforeRun,
        ideConfig,
        sqlDialect = "sqlite",
        sqlDatasetId,
        sqlResultShape,
        sqlPaneOptions,
        sqlSchemaSql,
        sqlSeedSql,
        sqlSetupSql,
        sqlInitialTableSnapshots,
    } = props;

    const tools = useReviewTools();
    const boundId = tools?.boundId ?? null;
    const clearRunFeedback = tools?.clearRunFeedback;
    const setRunFeedbackForCard = tools?.setRunFeedback;
    const syncCodeInputSnapshot = tools?.syncCodeInputSnapshot;

    const { ref, size } = useElementSize<HTMLDivElement>();

    const editorExerciseStateKey = useMemo(() => {
        const rawToolScope =
            typeof toolScopeKey === "string" && toolScopeKey.trim()
                ? toolScopeKey
                : null;

        const scopedToolKey =
            rawToolScope && isExerciseEditorScope(rawToolScope)
                ? rawToolScope
                : null;

        const scopedBoundId =
            boundId && isExerciseEditorScope(boundId)
                ? boundId
                : null;

        /**
         * Valid modes:
         *
         * 1. Exercise mode:
         *    Prefer toolScopeKey because the right rail passes the canonical
         *    full exercise key there.
         *
         * 2. Card/sketch mode:
         *    Use the current card toolScopeKey.
         *
         * Do not prefer boundId first; in this app it can be the legacy
         * review-quiz/input id, which makes CodeRunner bind to the wrong model.
         */
        if (scopedToolKey) return scopedToolKey;
        if (scopedBoundId) return scopedBoundId;
        if (rawToolScope) return rawToolScope;

        return "general";
    }, [toolScopeKey, boundId]);

    const exerciseKey = isExerciseEditorScope(editorExerciseStateKey)
        ? editorExerciseStateKey
        : null;

    const cardRuntimeKey = useMemo(() => {
        if (!isCardEditorScope(editorExerciseStateKey)) return null;

        if (editorExerciseStateKey.startsWith("card:")) {
            return editorExerciseStateKey.replace(/^card:/, "");
        }

        return editorExerciseStateKey;
    }, [editorExerciseStateKey]);


    const editorMode: "exercise" | "sketch" | "none" = exerciseKey
        ? "exercise"
        : cardRuntimeKey
            ? "sketch"
            : "none";

    const isExerciseEditorMode = editorMode === "exercise";
    const isSketchEditorMode = editorMode === "sketch";
    const hasBindableEditorTarget = editorMode !== "none";


    const derivedEditorOwnerKey = exerciseKey ?? cardRuntimeKey ?? null;
    const explicitEditorOwnerKey =
        typeof editorOwnerKey === "string" && isBindableEditorOwnerKey(editorOwnerKey)
            ? editorOwnerKey.trim()
            : null;
    const resolvedEditorOwnerKey = explicitEditorOwnerKey ?? derivedEditorOwnerKey;
    const editorRuntime = useReviewRuntimeStore((s) =>
        resolvedEditorOwnerKey ? s.editorRuntimes[resolvedEditorOwnerKey] ?? null : null,
    );

    const exerciseRuntime = useReviewRuntimeStore((s) =>
        exerciseKey ? s.exercises[exerciseKey] ?? null : null,
    );

    const patchEditorWorkspace = useReviewRuntimeStore((s) => s.patchEditorWorkspace);
    /**
     * REVIEW DIRECT WORKSPACE MODE
     *
     * This bypasses the legacy bridge/hydration path for route-owned review
     * targets. If the current exercise/card runtime has a ready workspace,
     * that workspace is the only source for FullIDE.
     */
    const reviewDirectWorkspace =
        editorRuntime?.workspaceStatus === "ready" &&
        reviewWorkspaceHasNonEmptyFile(editorRuntime.workspace)
            ? editorRuntime.workspace
            : exerciseRuntime?.workspaceStatus === "ready" &&
            reviewWorkspaceHasNonEmptyFile(exerciseRuntime.workspace)
                ? exerciseRuntime.workspace
                : null;
    useEffect(() => {
        if (!reviewToolPaneDebugEnabled()) return;

        reviewSaveDebug("visible CodeToolPane runtime", {
            resolvedEditorOwnerKey,
            workspaceStatus: editorRuntime?.workspaceStatus,
            workspaceOrigin: editorRuntime?.workspaceOrigin,
            userEdited: editorRuntime?.userEdited,
            language: editorRuntime?.language,
            codeLength: String(editorRuntime?.code ?? "").length,
            workspace: summarizeWorkspaceForSave(editorRuntime?.workspace),
        });
    }, [
        resolvedEditorOwnerKey,
        editorRuntime?.workspaceStatus,
        editorRuntime?.workspaceOrigin,
        editorRuntime?.userEdited,
        editorRuntime?.language,
        editorRuntime?.code,
        editorRuntime?.workspace,
    ]);

    const reviewDirectWorkspaceReady = !!reviewDirectWorkspace;
    const hasEditorTarget = Boolean(
        hasBindableEditorTarget ||
        reviewWorkspaceHasNonEmptyFile(editorRuntime?.workspace) ||
        reviewWorkspaceHasNonEmptyFile(exerciseRuntime?.workspace) ||
        forceWorkspaceHasContent(toolWorkspace),
    );

    const isReviewRouteMode = Boolean(resolvedEditorOwnerKey && hasBindableEditorTarget);


    const reviewDirectWorkspaceError = editorRuntime?.workspaceStatus === "error";
    const effectiveLanguage = (isReviewRouteMode ? editorRuntime?.language : null) ?? toolLang;
    const isSql = effectiveLanguage === "sql";
    const ideShell = useMemo(
        () => resolveFullIDEConfigFromLearningIde({ ideConfig }),
        [ideConfig],
    );
    const shouldForceDesktopLayout = ideShell.services.explorer?.enabled === true;

// Important:
// Review runtime always passes a WorkspaceStateV2, even for one-file starters.
// So force workspace shell whenever review runtime has a ready workspace.
// Otherwise single-file starter can get stuck in the legacy "single" loading path.
    const usesWorkspaceShell =
        reviewDirectWorkspaceReady || shouldForceDesktopLayout || ideShell.access.canUseMultiFile;
    const workspaceOwnerKey = resolvedEditorOwnerKey ?? editorExerciseStateKey ?? toolScopeKey ?? boundId ?? "general";

    const workspaceContextKey = useMemo(
        () =>
            JSON.stringify({
                ownerKey: workspaceOwnerKey,
                language: effectiveLanguage,
                sqlDatasetId: sqlDatasetId ?? "",
                sqlSchemaSql: sqlSchemaSql ?? sqlSetupSql ?? "",
                sqlSeedSql: sqlSeedSql ?? "",
                workspaceShell: usesWorkspaceShell,
            }),
        [
            workspaceOwnerKey,
            sqlDatasetId,
            sqlSchemaSql,
            sqlSeedSql,
            sqlSetupSql,
            effectiveLanguage,
            usesWorkspaceShell,
        ],
    );
    const runnerH = Math.max(usesWorkspaceShell ? 480 : 320, size.h);

    const [runFeedback, setRunFeedback] = useState<CodeFeedback | null>(null);
    const [ideReady, setIdeReady] = useState(false);
    const lastEmittedRef = useRef<{ code: string; stdin: string } | null>(null);
    const lastIncomingRef = useRef<{ code: string; stdin: string } | null>(null);
    const persistTimerRef = useRef<number | null>(null);
    const pendingWorkspaceRef = useRef<WorkspaceStateV2 | null | undefined>(undefined);
    const lastHandledWorkspaceKeyRef = useRef<string>("");
    const lastHandledStructureKeyRef = useRef<string>("");
    const lastUpstreamWorkspaceKeyRef = useRef<string>("");
    const [localWorkspaceDraft, setLocalWorkspaceDraft] = useState<ReviewWorkspaceDraft | null>(null);

    useEffect(() => {
        if (!isReviewRouteMode || !resolvedEditorOwnerKey) {
            setLocalWorkspaceDraft(null);
            return;
        }

        setLocalWorkspaceDraft(readReviewWorkspaceDraft(resolvedEditorOwnerKey));
    }, [isReviewRouteMode, resolvedEditorOwnerKey, workspaceContextKey]);

    const exerciseWorkspaceReady = Boolean(
        exerciseKey &&
        (
            reviewWorkspaceHasNonEmptyFile(editorRuntime?.workspace) ||
            reviewWorkspaceHasNonEmptyFile(exerciseRuntime?.workspace)
        )
    );

    const cardWorkspaceReady = Boolean(
        cardRuntimeKey &&
        reviewWorkspaceHasNonEmptyFile(editorRuntime?.workspace)
    );

    function createDefaultToolWorkspace(language: string | null | undefined): WorkspaceStateV2 {
        const now = Date.now();
        const normalizedLanguage = asWorkspaceLanguage(language);

        return {
            version: 2,
            language: normalizedLanguage,
            nodes: [
                {
                    id: "file:main.py",
                    kind: "file",
                    name: "main.py",
                    parentId: null,
                    content: "",
                    createdAt: now,
                    updatedAt: now,
                },
            ],
            openTabs: ["file:main.py"],
            activeFileId: "file:main.py",
            entryFileId: "file:main.py",
            stdin: "",
            expanded: [],
            leftPct: 40,
        };
    }
    const runtimeWorkspaceError = Boolean(isReviewRouteMode && editorRuntime?.workspaceStatus === "error");
    const directRuntimeWorkspace = useMemo(() => {
        if (isReviewRouteMode) {
            // Review/exercise route: blank runtime workspace should NOT hide starter code.
            if (
                editorRuntime?.workspaceStatus === "ready" &&
                reviewWorkspaceHasNonEmptyFile(editorRuntime.workspace)
            ) {
                return editorRuntime.workspace;
            }

            if (
                exerciseRuntime?.workspaceStatus === "ready" &&
                reviewWorkspaceHasNonEmptyFile(exerciseRuntime.workspace)
            ) {
                return exerciseRuntime.workspace;
            }

            return null;
        }

        // Normal tool/sketch route: blank file workspace is still valid.
        // This preserves the old behavior where an unbound sketch/editor can show
        // an empty editor and still save through onChangeWorkspace.
        if (forceWorkspaceHasContent(toolWorkspace)) {
            return toolWorkspace ?? null;
        }

        return createDefaultToolWorkspace(effectiveLanguage);
    }, [
        isReviewRouteMode,
        editorRuntime?.workspaceStatus,
        editorRuntime?.workspace,
        exerciseRuntime?.workspaceStatus,
        exerciseRuntime?.workspace,
        toolWorkspace,
        effectiveLanguage,
    ]);
    const finalReviewWorkspace = useMemo(() => {
        if (
            isReviewRouteMode &&
            shouldUseLocalReviewDraft({
                draft: localWorkspaceDraft,
                runtimeWorkspace: directRuntimeWorkspace,
                runtimeUpdatedAt: editorRuntime?.updatedAt,
                runtimeUserEdited: editorRuntime?.userEdited,
                runtimeOrigin: editorRuntime?.workspaceOrigin,
            })
        ) {
            return localWorkspaceDraft?.workspace ?? directRuntimeWorkspace;
        }

        return directRuntimeWorkspace;
    }, [
        directRuntimeWorkspace,
        editorRuntime?.updatedAt,
        editorRuntime?.userEdited,
        editorRuntime?.workspaceOrigin,
        isReviewRouteMode,
        localWorkspaceDraft,
    ]);

    const finalReviewWorkspaceLanguage = String(
        (finalReviewWorkspace as any)?.language ?? "",
    ).toLowerCase();

    const finalWorkspaceMatchesLanguage =
        !finalReviewWorkspaceLanguage ||
        !effectiveLanguage ||
        languagesCompatible(finalReviewWorkspaceLanguage, effectiveLanguage);

    const runtimeWorkspacePending = Boolean(
        isReviewRouteMode &&
        !runtimeWorkspaceError &&
        (
            exerciseKey
                ? !editorRuntime || editorRuntime.workspaceStatus === "pending"
                : editorRuntime?.workspaceStatus === "pending"
        ),
    );

    const canRenderEditor = Boolean(
        finalReviewWorkspace &&
        !runtimeWorkspaceError &&
        finalWorkspaceMatchesLanguage &&
        forceWorkspaceHasContent(finalReviewWorkspace),
    );
    /**
     * Do not show the editor loading fallback when the tools rail is not bound
     * to an exercise/sketch/code target. In that state there is no workspace to
     * wait for, so showing the timeout card makes normal lesson pages look
     * broken.
     */
    const shouldWaitForWorkspace = Boolean(
        hasEditorTarget &&
        (
            runtimeWorkspacePending ||
            (
                !isReviewRouteMode &&
                usesWorkspaceShell &&
                reviewWorkspaceHasNonEmptyFile(toolWorkspace)
            )
        ),
    );

    const showLoadingMask =
        !runtimeWorkspaceError &&
        !canRenderEditor &&
        shouldWaitForWorkspace;

    const showNoEditorTarget =
        !runtimeWorkspaceError &&
        !canRenderEditor &&
        !showLoadingMask &&
        hasBindableEditorTarget;

    const [loadingTimedOut, setLoadingTimedOut] = useState(false);

    useEffect(() => {
        if (!showLoadingMask) {
            setLoadingTimedOut(false);
            return;
        }

        const timer = window.setTimeout(() => setLoadingTimedOut(true), 10000);
        return () => window.clearTimeout(timer);
    }, [showLoadingMask, workspaceContextKey]);

    const retryEditorLoad = useCallback(() => {
        setLoadingTimedOut(false);
        if (resolvedEditorOwnerKey) {
            const runtimeApi = useReviewRuntimeStore.getState();
            const existing = runtimeApi.editorRuntimes[resolvedEditorOwnerKey];
            if (existing?.workspace) {
                runtimeApi.patchEditorWorkspace(resolvedEditorOwnerKey, existing.workspace);
            }
        }
    }, [resolvedEditorOwnerKey]);

    useEffect(() => {
        setIdeReady(false);
        lastEmittedRef.current = null;
        lastIncomingRef.current = null;
        pendingWorkspaceRef.current = undefined;
        lastHandledWorkspaceKeyRef.current = "";
        lastHandledStructureKeyRef.current = "";
        lastUpstreamWorkspaceKeyRef.current = "";
    }, [workspaceContextKey]);

    useLayoutEffect(() => {
        if (!finalReviewWorkspace) return;
        if (typeof pendingWorkspaceRef.current !== "undefined" || persistTimerRef.current != null) return;
        const workspaceKey = workspaceKeyOf(finalReviewWorkspace);
        lastHandledWorkspaceKeyRef.current = workspaceKey;
        lastHandledStructureKeyRef.current = workspaceStructureKeyOf(finalReviewWorkspace);
        lastUpstreamWorkspaceKeyRef.current = workspaceKey;
    }, [workspaceContextKey, finalReviewWorkspace]);

    useEffect(() => {
        setRunFeedback(null);
        if (boundId) clearRunFeedback?.(boundId);
    }, [effectiveLanguage, toolCode, toolStdin, boundId, clearRunFeedback]);

    useEffect(() => {
        return () => {
            if (persistTimerRef.current != null) {
                window.clearTimeout(persistTimerRef.current);
                persistTimerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        lastIncomingRef.current = {
            code: toolCode,
            stdin: toolStdin,
        };
    }, [toolCode, toolStdin]);

    if (reviewToolPaneDebugEnabled()) {
        starterPaneTrace("pane.renderGate", {
            exerciseKey,
            cardRuntimeKey,
            editorOwnerKey: resolvedEditorOwnerKey,
            workspaceContextKey,
            directRuntimeWorkspaceKey: workspaceKeyOf(directRuntimeWorkspace ?? null),
            finalReviewWorkspaceKey: workspaceKeyOf(finalReviewWorkspace ?? null),
            finalReviewWorkspaceHasContent: forceWorkspaceHasContent(finalReviewWorkspace),
            directRuntimeWorkspaceHasContent: reviewWorkspaceHasNonEmptyFile(directRuntimeWorkspace),
            exerciseWorkspaceReady,
            cardWorkspaceReady,
            runtimeWorkspaceError,
            runtimeWorkspacePending,
            canRenderEditor,
            showLoadingMask,
            storeExerciseStatus: exerciseKey ? editorRuntime?.workspaceStatus : null,
            storeCardStatus: cardRuntimeKey ? editorRuntime?.workspaceStatus : null,
        });

        reviewSaveDebug("visible exercise editor", {
            boundId,
            resolvedEditorOwnerKey,
            exerciseKey,
            cardRuntimeKey,
            workspaceOrigin: editorRuntime?.workspaceOrigin,
            userEdited: editorRuntime?.userEdited,
            workspace: summarizeWorkspaceForSave(finalReviewWorkspace),
        });
    }

    const emitWorkspaceUpstream = useCallback((workspace: WorkspaceStateV2 | null) => {
        // Do not write review editor workspaces to localStorage. The DB/runtime
        // state is canonical so the same logged-in sketch resolves identically
        // on every computer.
        const workspaceKey = workspaceKeyOf(workspace ?? null);
        if (lastUpstreamWorkspaceKeyRef.current === workspaceKey) return;
        lastUpstreamWorkspaceKeyRef.current = workspaceKey;

        const next = extractWorkspaceSnapshot(workspace);
        const prevEmitted = lastEmittedRef.current;
        const prevIncoming = lastIncomingRef.current;
        const workspacePatch =
            workspace && typeof workspace === "object"
                ? {
                    workspace,
                    codeWorkspace: workspace,
                    ideWorkspace: workspace,
                }
                : {};



        const codeMatchesPreviousEmission =
            prevEmitted?.code === next.code && prevEmitted?.stdin === next.stdin;
        const codeMatchesIncomingProps =
            prevIncoming?.code === next.code && prevIncoming?.stdin === next.stdin;
        const shouldEmitCodeFields = !codeMatchesPreviousEmission && !codeMatchesIncomingProps;

        lastEmittedRef.current = next;
        if (boundId) {
            syncCodeInputSnapshot?.(boundId, {
                ...workspacePatch,
                code: next.code,
                source: next.code,
                stdin: next.stdin,
                codeStdin: next.stdin,
                language: effectiveLanguage,
                lang: effectiveLanguage,

                updateOrigin: shouldEmitCodeFields ? "user" : "sync",
                workspaceOrigin: shouldEmitCodeFields ? "user" : "sync",

                ...(shouldEmitCodeFields
                    ? {
                        submitted: false,
                        feedbackDismissed: true,
                        dismissFeedbackOnEdit: true,
                        userEdited: true,
                    }
                    : {}),

                updatedAt: Date.now(),
            });
        }        if (shouldEmitCodeFields) {
            setRunFeedback(null);

            if (boundId) {
                clearRunFeedback?.(boundId);
            }
        }

        if (isReviewRouteMode && resolvedEditorOwnerKey) {
            patchEditorWorkspace(resolvedEditorOwnerKey, workspace);
            return;
        }

        onChangeWorkspace?.(workspace);

        if (!shouldEmitCodeFields) {
            return;
        }

        onChangeCode(next.code);
        onChangeStdin(next.stdin);

    }, [
        boundId,
        clearRunFeedback,
        effectiveLanguage,
        resolvedEditorOwnerKey,
        isReviewRouteMode,
        onChangeCode,
        onChangeStdin,
        onChangeWorkspace,
        patchEditorWorkspace,
        syncCodeInputSnapshot,
    ]);
    const emitWorkspaceUpstreamRef = useRef(emitWorkspaceUpstream);

    useEffect(() => {
        emitWorkspaceUpstreamRef.current = emitWorkspaceUpstream;
    }, [emitWorkspaceUpstream]);

    const flushPendingWorkspace = useCallback(() => {
        if (persistTimerRef.current != null) {
            window.clearTimeout(persistTimerRef.current);
            persistTimerRef.current = null;
        }

        if (typeof pendingWorkspaceRef.current === "undefined") {
            return;
        }

        const pending = pendingWorkspaceRef.current;
        pendingWorkspaceRef.current = undefined;
        emitWorkspaceUpstreamRef.current(pending);
    }, []);

    const handleWorkspaceChange = useCallback((workspace: WorkspaceStateV2 | null) => {
        /**
         * FullIDE can briefly emit a null/blank workspace while its internal
         * workspace bridge is booting. In route-owned review mode the runtime
         * store is the source of truth, so that transient emission must not be
         * persisted back into the store. Otherwise a ready sketch/card workspace
         * is overwritten with null, workspaceStatus becomes "pending", FullIDE
         * unmounts, and the right rail sits on "Loading sketch workspace..."
         * forever.
         */
        if (
            isReviewRouteMode &&
            forceWorkspaceHasContent(finalReviewWorkspace) &&
            !forceWorkspaceHasContent(workspace)
        ) {
            return;
        }
        if (boundId && workspace && forceWorkspaceHasContent(workspace)) {
            const next = extractWorkspaceSnapshot(workspace);

            syncCodeInputSnapshot?.(boundId, {
                workspace,
                codeWorkspace: workspace,
                ideWorkspace: workspace,

                code: next.code,
                source: next.code,

                stdin: next.stdin,
                codeStdin: next.stdin,

                language: effectiveLanguage,
                lang: effectiveLanguage,

                updateOrigin: "user",
                workspaceOrigin: "user",
                userEdited: true,

                submitted: false,
                feedbackDismissed: true,
                dismissFeedbackOnEdit: true,

                updatedAt: Date.now(),
            });
        }
        const workspaceKey = workspaceKeyOf(workspace ?? null);

        if (lastHandledWorkspaceKeyRef.current === workspaceKey) {
            return;
        }

        const previousStructureKey = lastHandledStructureKeyRef.current;
        const nextStructureKey = workspaceStructureKeyOf(workspace ?? null);
        const structureChanged =
            previousStructureKey !== "" && previousStructureKey !== nextStructureKey;

        lastHandledWorkspaceKeyRef.current = workspaceKey;
        lastHandledStructureKeyRef.current = nextStructureKey;

        if (!usesWorkspaceShell || structureChanged) {
            if (persistTimerRef.current != null) {
                window.clearTimeout(persistTimerRef.current);
                persistTimerRef.current = null;
            }
            pendingWorkspaceRef.current = undefined;
            emitWorkspaceUpstream(workspace);
            return;
        }

        pendingWorkspaceRef.current = workspace;

        if (persistTimerRef.current != null) {
            window.clearTimeout(persistTimerRef.current);
        }

        persistTimerRef.current = window.setTimeout(() => {
            persistTimerRef.current = null;
            const pending = pendingWorkspaceRef.current;
            pendingWorkspaceRef.current = undefined;
            emitWorkspaceUpstreamRef.current(pending ?? null);
        }, 220);
    }, [
            boundId,
            effectiveLanguage,
            emitWorkspaceUpstream,
            finalReviewWorkspace,
            isReviewRouteMode,
            syncCodeInputSnapshot,
            usesWorkspaceShell,
        ]

    );

    useEffect(() => {
        return () => {
            if (!usesWorkspaceShell) return;
            flushPendingWorkspace();
        };
    }, [workspaceContextKey, usesWorkspaceShell, flushPendingWorkspace]);

    useEffect(() => {
        if (!usesWorkspaceShell) return;

        const flushForPageExit = () => {
            flushPendingWorkspace();
        };

        const onVisibilityChange = () => {
            if (document.visibilityState === "hidden") {
                flushPendingWorkspace();
            }
        };

        window.addEventListener("pagehide", flushForPageExit, { capture: true });
        document.addEventListener("visibilitychange", onVisibilityChange, { capture: true });

        return () => {
            window.removeEventListener("pagehide", flushForPageExit, { capture: true });
            document.removeEventListener("visibilitychange", onVisibilityChange, { capture: true });
        };
    }, [usesWorkspaceShell, flushPendingWorkspace]);

    const handleBeforeRun = useCallback(async () => {
        flushPendingWorkspace();
        setRunFeedback(null);
        if (boundId) clearRunFeedback?.(boundId);
        await onBeforeRun?.();
    }, [boundId, clearRunFeedback, flushPendingWorkspace, onBeforeRun]);

    const handleRunResult = useCallback(({ result, runArgs }: { result: any; runArgs: any }) => {
        const feedback = pickRunFeedbackFromResult({
            result,
            language: runArgs.language,
            code: runArgs.code,
        });

        setRunFeedback(feedback);

        if (boundId) {
            setRunFeedbackForCard?.(boundId, feedback);
        }
    }, [boundId, setRunFeedbackForCard]);

    /**
     * DIRECT REVIEW WORKSPACE MODE
     *
     * For route-owned review targets, the runtime store is the source of truth.
     * Do not wait for workspaceBridge handoff to decide whether FullIDE can mount.
     *
     * route target -> runtime store workspace -> FullIDE
     */
    const fullIdeKey = `${workspaceOwnerKey}:${effectiveLanguage}:${usesWorkspaceShell ? "workspace" : "single"}`;
    const fullIdeLanguage = asWorkspaceLanguage(effectiveLanguage);

    return (
        <div ref={ref} className="flex h-full min-h-0 w-full flex-col overflow-hidden">
            <div className="relative h-full min-h-0 flex-1">
                {canRenderEditor ? (
                    <FullIDE
                        key={fullIdeKey}
                        title={isSql ? "Run SQL" : "Run code"}
                        height={runnerH - 50}
                        fullHeight
                        language={fullIdeLanguage}
                        access={{
                            hasUser: true,
                            canUseMultiFile: isSql || reviewDirectWorkspaceReady || ideShell.access.canUseMultiFile,
                            canSaveCloud: ideShell.access.canSaveCloud,
                            canCreateProjects: ideShell.access.canCreateProjects,
                        }}
                        loginHref="/authenticate"
                        billingHref="/billing"
                        draftStorageMode="off"
                        servicePreset={ideShell.servicePreset}
                        // forceDesktopLayout={shouldForceDesktopLayout}
                        forceDesktopLayout={usesWorkspaceShell}
                        services={{
                            ...ideShell.services,
                            runner: {
                                ...(ideShell.services.runner ?? {}),
                                showThemeToggle: true,
                                showSqlDialectPicker: false,
                            },
                        }}
                        initialWorkspace={finalReviewWorkspace}
                        externalWorkspace={finalReviewWorkspace}
                        exerciseStateKey={workspaceOwnerKey}
                        projectScope={{
                            kind: "review-tool" as any,
                            scopeKey: `review-tool:${workspaceOwnerKey}`,
                        }}
                        onWorkspaceChange={handleWorkspaceChange}
                        onBeforeRun={handleBeforeRun}
                        onRunResult={handleRunResult}
                        onReadyChange={setIdeReady}
                        initialSqlDialect={sqlDialect}
                        sqlDatasetId={sqlDatasetId}
                        sqlResultShape={sqlResultShape}
                        sqlPaneOptions={sqlPaneOptions ?? ideShell.sqlPaneOptions}
                        sqlSchemaSql={sqlSchemaSql ?? sqlSetupSql}
                        sqlSeedSql={sqlSeedSql}
                        sqlSetupSql={sqlSetupSql}
                        sqlInitialTableSnapshots={sqlInitialTableSnapshots}
                    />
                ) : null}

                {showLoadingMask ? (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-neutral-950/70 backdrop-blur-sm">
                        {loadingTimedOut ? (
                            <div className="max-w-md rounded-2xl border border-white/10 bg-black/50 p-5 text-center text-white shadow-2xl">
                                <div className="text-sm font-semibold">Editor is taking longer than expected.</div>
                                <div className="mt-2 text-xs text-white/65">
                                    Your saved review progress is still safe. Retry the editor load, or refresh if the workspace does not appear.
                                </div>
                                <button
                                    type="button"
                                    onClick={retryEditorLoad}
                                    className="mt-4 rounded-full bg-white px-4 py-2 text-xs font-bold text-neutral-950 hover:bg-white/90"
                                >
                                    Retry editor
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 rounded-full border border-white/10 bg-black/40 px-4 py-2 text-sm font-semibold text-white/80">
                                <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />
                                {cardRuntimeKey ? "Loading sketch workspace..." : "Loading editor..."}
                            </div>
                        )}
                    </div>
                ) : showNoEditorTarget ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-950/20">
                        <div className="max-w-sm rounded-2xl border border-white/10 bg-black/35 p-5 text-center text-white/80 shadow-xl">
                            <div className="text-sm font-semibold text-white">
                                {isSketchEditorMode ? "No sketch editor is bound" : "No exercise editor is bound"}
                            </div>

                            <div className="mt-2 text-xs leading-5 text-white/60">
                                {isSketchEditorMode
                                    ? "This sketch does not have a ready workspace yet."
                                    : "This exercise does not have a ready workspace yet."}
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>

            {!isSql && runFeedback ? (
                <div className="mt-3">
                    <CodeFeedbackCallout feedback={runFeedback} />
                </div>
            ) : null}
        </div>
    );
}
