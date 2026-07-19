"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import type { WorkspaceStateV2 } from "@/components/ide/types";
import type { SqlPaneOptions } from "@/components/code/runner/components/sql/results-pane";
import type { ToolRunnerPanePolicy, ToolSurface } from "@zoeskoul/curriculum-contracts";
import type {
    SqlDialect,
    TerminalEvidence,
    WorkspaceLanguage,
} from "@/lib/practice/types";
import { useElementSize } from "@/components/tools/hooks/useElementSize";
import { pickRunFeedbackFromResult } from "@/lib/code/feedback";
import type { CodeFeedback } from "@/lib/code/feedback/types";
import CodeFeedbackCallout from "@/components/practice/kinds/CodeFeedbackCallout";
import { useReviewTools } from "@/components/review/module/context/ReviewToolsContext";
import { RunnerLanguage } from "@zoeskoul/code-contracts";
import {
    type LearningIdeConfig,
    mergeLearningIdeConfigs,
    resolveFullIDEConfigFromLearningIde,
} from "@/lib/ide/learningIdeConfig";
import { useReviewRuntimeStore } from "@/components/review/module/runtime/reviewRuntimeStore";
import { reviewSaveDebug, summarizeWorkspaceForSave } from "@/components/review/module/runtime/reviewSaveDebug";
import {languagesCompatible} from "@/components/review/module/utils";
import {defaultMainFile} from "@/components/ide/languageDefaults";
import { normalizeCodeWorkspacePair } from "@/components/review/module/runtime/workspaceCodeSource";
import {
    clearReviewWorkspaceDraft,
    isWorkspaceState,
    readReviewWorkspaceDraft,
    ReviewWorkspaceDraft,
    writeReviewWorkspaceDraft
} from "@/components/tools/panes/reviewWorkspaceDrafts";
import {
    extractRuntimeSnapshotFromWorkspace,
    selectWorkspaceForSubmit,
    type WorkspaceSubmitCache,
} from "@/components/tools/panes/workspaceSnapshot";
import { learnerUiFlags } from "@/lib/config/learnerUiFlags";
import { getReviewSubmitBridgeHost } from "@/lib/review/submitBridge";

const FullIDE = dynamic(() => import("@/components/ide/fullide/FullIDE"), {
    ssr: false,
    loading: () => null,
});

let codeToolPaneEditorPreloadPromise: Promise<void> | null = null;

export function preloadCodeToolPaneEditorAssets() {
    if (codeToolPaneEditorPreloadPromise) {
        return codeToolPaneEditorPreloadPromise;
    }

    codeToolPaneEditorPreloadPromise = Promise.all([
        import("@/components/ide/fullide/FullIDE"),
        import("@monaco-editor/react"),
        import("monaco-editor"),
    ]).then(() => undefined);

    return codeToolPaneEditorPreloadPromise;
}

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




function workspaceLanguageOf(workspace: WorkspaceStateV2 | null | undefined) {
    return typeof workspace?.language === "string" ? workspace.language : "";
}

function workspaceMatchesLanguage(
    workspace: WorkspaceStateV2 | null | undefined,
    language: string | null | undefined,
) {
    const workspaceLanguage = workspaceLanguageOf(workspace);
    const targetLanguage = String(language ?? "");

    if (!workspaceLanguage || !targetLanguage) return true;

    return languagesCompatible(workspaceLanguage, targetLanguage);
}

function terminalEvidenceKeyOf(evidence: TerminalEvidence | null | undefined) {
    return JSON.stringify(evidence ?? null);
}

function stableJsonKey(value: unknown): string {
    const normalize = (input: unknown): unknown => {
        if (Array.isArray(input)) {
            return input.map(normalize);
        }

        if (input && typeof input === "object") {
            return Object.fromEntries(
                Object.entries(input as Record<string, unknown>)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([key, entry]) => [key, normalize(entry)]),
            );
        }

        return input ?? null;
    };

    try {
        return JSON.stringify(normalize(value ?? null));
    } catch {
        return String(value ?? "null");
    }
}

function learningIdeConfigContentKey(value: LearningIdeConfig | null | undefined) {
    return stableJsonKey(value ?? null);
}

export function resolveEffectiveCodeToolPaneIdeConfig(args: {
    propIdeConfig?: LearningIdeConfig | null;
    exerciseIdeConfig?: LearningIdeConfig | null;
    cardIdeConfig?: LearningIdeConfig | null;
    isReviewRouteMode: boolean;
}): LearningIdeConfig | null {
    const runtimeIdeConfig = args.isReviewRouteMode
        ? args.exerciseIdeConfig ?? args.cardIdeConfig ?? null
        : null;

    const merged = mergeLearningIdeConfigs(args.propIdeConfig ?? null, runtimeIdeConfig);

    if (!args.isReviewRouteMode) {
        return merged;
    }

    const runtimeTerminalCwd =
        typeof runtimeIdeConfig?.terminalCwd === "string" && runtimeIdeConfig.terminalCwd.trim()
            ? runtimeIdeConfig.terminalCwd.trim()
            : null;
    const propTerminalCwd =
        typeof args.propIdeConfig?.terminalCwd === "string" && args.propIdeConfig.terminalCwd.trim()
            ? args.propIdeConfig.terminalCwd.trim()
            : null;

    /**
     * In review routes, the bound runtime exercise/card is the canonical source
     * for step-local terminal cwd. The Tools-pane prop can be sticky during
     * project-step navigation, so letting it override runtime can keep task 2/3
     * at /workspace even though the manifest authored a deeper cwd.
     */
    const terminalCwd = runtimeTerminalCwd ?? propTerminalCwd;
    if (!terminalCwd) {
        return merged;
    }

    return {
        ...(merged ?? {}),
        terminalCwd,
        terminalSessionScope:
            runtimeIdeConfig?.terminalSessionScope ??
            args.propIdeConfig?.terminalSessionScope ??
            merged?.terminalSessionScope,
    };
}

export function shouldUseLocalReviewDraft(args: {
    draft: ReviewWorkspaceDraft | null;
    runtimeWorkspace: WorkspaceStateV2 | null | undefined;
    runtimeUpdatedAt?: number | null;
    runtimeUserEdited?: boolean | null;
    runtimeOrigin?: string | null;
    runtimeProtected?: boolean | null;
}) {
    const draft = args.draft;
    if (!draft || !isWorkspaceState(draft.workspace)) return false;

    /**
     * Short-lived same-tab safety net only.
     *
     * Runtime/DB still wins whenever it has real learner work. This only protects
     * fast sidebar/direct navigation where the editor runtime is temporarily
     * reseeded from starter before the saved user workspace wins.
     */
    const maxDraftAgeMs = 10 * 60 * 1000;
    if (Date.now() - draft.savedAt > maxDraftAgeMs) return false;

    if (
        args.runtimeProtected === true ||
        args.runtimeUserEdited === true ||
        args.runtimeOrigin === "user" ||
        args.runtimeOrigin === "saved"
    ) {
        return false;
    }

    if (!args.runtimeWorkspace || !isWorkspaceState(args.runtimeWorkspace)) {
        return true;
    }

    const runtimeKey = JSON.stringify(args.runtimeWorkspace);
    const draftKey = JSON.stringify(draft.workspace);

    if (runtimeKey === draftKey) return false;

    if (args.runtimeOrigin === "starter" || args.runtimeOrigin === "empty") {
        return true;
    }

    const runtimeUpdatedAt = Number(args.runtimeUpdatedAt ?? 0);
    return !Number.isFinite(runtimeUpdatedAt) || draft.savedAt >= runtimeUpdatedAt;
}

function firstNonBlankToolPaneString(...values: unknown[]) {
    for (const value of values) {
        if (typeof value === "string" && value.trim().length > 0) {
            return value.trim();
        }
    }

    return "";
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

export function buildReviewFullIdeExerciseStateKey(
    workspaceOwnerIdentityKey: string,
    resetRevision: number,
) {
    /**
     * Monaco models and the editor safety cache are keyed by exerciseStateKey.
     *
     * FullIDE already remounts when resetRevision changes, but a remount alone is
     * not enough because @monaco-editor/react keeps inactive file models alive and
     * EditorPane restores them from sessionStorage. Give every reset generation a
     * fresh editor identity so every starter file, not only the active entry file,
     * is recreated from the authoritative runtime workspace.
     */
    const normalizedRevision = Number.isFinite(resetRevision)
        ? Math.max(0, Math.trunc(resetRevision))
        : 0;

    return `${workspaceOwnerIdentityKey}:reset:${normalizedRevision}`;
}

export function resolveCodeToolPaneFullIdeMode(args: {
    ideConfig?: LearningIdeConfig | null;
    reviewDirectWorkspaceReady: boolean;
    effectiveLanguage?: string | null;
}) {
    const ideShell = resolveFullIDEConfigFromLearningIde({
        ideConfig: args.ideConfig ?? null,
    });
    const terminalWorkspaceMode = args.ideConfig?.layoutMode === "terminal_workspace";
    const usesWorkspaceShell =
        args.reviewDirectWorkspaceReady ||
        ideShell.services.explorer?.enabled === true ||
        ideShell.access.canUseMultiFile;

    const fullIdeTitle = terminalWorkspaceMode
        ? args.effectiveLanguage === "bash"
            ? "Linux terminal"
            : "Terminal lab"
        : args.effectiveLanguage === "sql"
            ? "Run SQL"
            : "Run code";

    return {
        ideShell,
        usesWorkspaceShell,
        forceDesktopLayout: false,
        fullIdeTitle,
    };
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

function getRuntimeCode(runtime: any) {
    const code =
        typeof runtime?.code === "string" && runtime.code.trim()
            ? runtime.code
            : typeof runtime?.source === "string" && runtime.source.trim()
                ? runtime.source
                : "";

    return code;
}

function getWorkspaceEntryFileId(workspace: WorkspaceStateV2 | null | undefined) {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return null;
    }

    const preferredId = workspace.entryFileId || workspace.activeFileId;

    const preferredFile = workspace.nodes.find(
        (node: any) => node?.kind === "file" && node.id === preferredId,
    );

    if (preferredFile?.kind === "file") return preferredFile.id;

    const firstFile = workspace.nodes.find((node: any) => node?.kind === "file");

    return firstFile?.kind === "file" ? firstFile.id : null;
}

function workspaceWithRuntimeEntryCode(
    workspace: WorkspaceStateV2 | null | undefined,
    runtime: any,
): WorkspaceStateV2 | null {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return workspace ?? null;
    }

    const runtimeCode = getRuntimeCode(runtime);

    if (!runtimeCode.trim()) return workspace;

    /**
     * If runtime carries user/saved/correct code but the workspace still carries
     * starter code, render the runtime code in the entry file. This prevents
     * progress reloads from visually restoring starter after a correct check.
     */
    if (
        !isUserOwnedReviewRuntimeState(runtime) &&
        !isCorrectReviewRuntimeState(runtime)
    ) {
        return workspace;
    }

    const targetId = getWorkspaceEntryFileId(workspace);

    if (!targetId) return workspace;

    let changed = false;

    const nodes = workspace.nodes.map((node: any) => {
        if (node?.kind !== "file" || node.id !== targetId) return node;

        if (String(node.content ?? "") === runtimeCode) return node;

        changed = true;

        return {
            ...node,
            content: runtimeCode,
            updatedAt: Number(runtime?.updatedAt ?? Date.now()),
        };
    });

    return changed ? { ...workspace, nodes } : workspace;
}

function reviewRuntimeProtectionRank(runtime: any) {
    /**
     * Rank 2: real learner/saved workspace. Always beats starter/correct.
     * Rank 1: correct result, but only fallback if no user/saved candidate exists.
     * Rank 0: normal starter/sync workspace.
     */
    if (isUserOwnedReviewRuntimeState(runtime)) return 2;
    if (isCorrectReviewRuntimeState(runtime)) return 1;
    return 0;
}

function workspaceHasAnyFile(workspace: WorkspaceStateV2 | null | undefined) {
    return Boolean(workspace?.nodes?.some((node: any) => node?.kind === "file"));
}
function workspaceFileCount(workspace: WorkspaceStateV2 | null | undefined) {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return 0;
    }

    return workspace.nodes.filter((node: any) => node?.kind === "file").length;
}

function workspaceNeedsMultiFile(workspace: WorkspaceStateV2 | null | undefined) {
    return workspaceFileCount(workspace) > 1;
}



function workspaceNodePathForPane(nodes: any[], node: any): string {
    if (!node) return "";

    const names: string[] = [String(node.name ?? "")].filter(Boolean);
    let parentId = node.parentId ?? null;

    while (parentId) {
        const parent = nodes.find((candidate) => candidate?.id === parentId);
        if (!parent) break;

        names.unshift(String(parent.name ?? ""));
        parentId = parent.parentId ?? null;
    }

    return names.filter(Boolean).join("/");
}

function uniquePaneNodeId(nodes: any[], kind: "file" | "folder", path: string) {
    const ids = new Set(nodes.map((node) => String(node?.id ?? "")));
    const base = `${kind}:${path}`;

    if (!ids.has(base)) return base;

    let index = 2;
    while (ids.has(`${base}:${index}`)) {
        index += 1;
    }

    return `${base}:${index}`;
}

function ensurePaneWorkspaceFolder(args: {
    workspace: WorkspaceStateV2;
    folderPath: string;
}): string | null {
    const parts = args.folderPath.split("/").filter(Boolean);
    let parentId: string | null = null;
    let currentPath = "";

    for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        const existing = args.workspace.nodes.find(
            (node: any) =>
                node?.kind === "folder" &&
                node?.name === part &&
                (node?.parentId ?? null) === parentId,
        );

        if (existing) {
            parentId = String(existing.id);
            continue;
        }

        const folderId = uniquePaneNodeId(args.workspace.nodes, "folder", currentPath);

        args.workspace.nodes.push({
            id: folderId,
            kind: "folder",
            name: part,
            parentId,
            createdAt: 0,
            updatedAt: 0,
        } as any);

        if (!args.workspace.expanded.includes(folderId as any)) {
            args.workspace.expanded.push(folderId as any);
        }

        parentId = folderId;
    }

    return parentId;
}

function mergeMissingFilesFromRuntimeWorkspace(
    baseWorkspace: WorkspaceStateV2 | null | undefined,
    runtimeWorkspace: WorkspaceStateV2 | null | undefined,
    options?: {
        /**
         * Starter resolution can first produce a multi-file shell where a fixture
         * path exists but its localized content has not arrived yet. During that
         * non-user-owned hydration only, fill an existing blank file from the
         * later deterministic runtime candidate. Never enable this for learner or
         * saved work because clearing a file can be an intentional edit.
         */
        hydrateBlankFiles?: boolean;
    },
): WorkspaceStateV2 | null {
    if (!baseWorkspace || baseWorkspace.version !== 2) {
        return baseWorkspace ?? runtimeWorkspace ?? null;
    }

    if (!runtimeWorkspace || runtimeWorkspace.version !== 2) {
        return baseWorkspace;
    }

    const baseNodes = Array.isArray(baseWorkspace.nodes) ? baseWorkspace.nodes : [];
    const runtimeNodes = Array.isArray(runtimeWorkspace.nodes) ? runtimeWorkspace.nodes : [];
    const runtimeFiles = runtimeNodes.filter((node: any) => node?.kind === "file");
    const runtimeFileByPath = new Map(
        runtimeFiles
            .map((node: any) => [workspaceNodePathForPane(runtimeNodes, node), node] as const)
            .filter(([path]) => Boolean(path)),
    );

    const existingPaths = new Set(
        baseNodes
            .filter((node: any) => node?.kind === "file")
            .map((node: any) => workspaceNodePathForPane(baseNodes, node))
            .filter(Boolean),
    );

    const missingFiles = runtimeFiles.filter((node: any) => {
        const path = workspaceNodePathForPane(runtimeNodes, node);
        return path && !existingPaths.has(path);
    });

    const blankFileIdsToHydrate = new Set<string>();

    if (options?.hydrateBlankFiles) {
        for (const node of baseNodes) {
            if (node?.kind !== "file") continue;
            if (String(node.content ?? "").trim().length > 0) continue;

            const path = workspaceNodePathForPane(baseNodes, node);
            const runtimeFile = path ? runtimeFileByPath.get(path) : null;

            if (!runtimeFile) continue;
            if (String(runtimeFile.content ?? "").trim().length === 0) continue;

            blankFileIdsToHydrate.add(String(node.id));
        }
    }

    if (missingFiles.length === 0 && blankFileIdsToHydrate.size === 0) {
        return baseWorkspace;
    }

    const merged: WorkspaceStateV2 = {
        ...baseWorkspace,
        nodes: baseNodes.map((node: any) => {
            if (node?.kind !== "file" || !blankFileIdsToHydrate.has(String(node.id))) {
                return { ...node };
            }

            const path = workspaceNodePathForPane(baseNodes, node);
            const runtimeFile = path ? runtimeFileByPath.get(path) : null;

            return runtimeFile
                ? {
                    ...node,
                    content: String(runtimeFile.content ?? ""),
                    updatedAt: runtimeFile.updatedAt ?? node.updatedAt ?? 0,
                }
                : { ...node };
        }),
        openTabs: [...(baseWorkspace.openTabs ?? [])],
        expanded: [...(baseWorkspace.expanded ?? [])],
    };

    for (const sourceFile of missingFiles) {
        const path = workspaceNodePathForPane(runtimeNodes, sourceFile);
        if (!path || existingPaths.has(path)) continue;

        const parts = path.split("/");
        const name = parts.pop() || String(sourceFile.name ?? "file.txt");
        const parentId = ensurePaneWorkspaceFolder({
            workspace: merged,
            folderPath: parts.join("/"),
        });

        const fileId = uniquePaneNodeId(merged.nodes, "file", path);

        merged.nodes.push({
            ...sourceFile,
            id: fileId,
            name,
            parentId,
            createdAt: sourceFile.createdAt ?? 0,
            updatedAt: sourceFile.updatedAt ?? 0,
        } as any);

        existingPaths.add(path);
    }

    return merged;
}

export function resolveCodeToolPaneReviewWorkspace(args: {
    draftStorageMode: "off" | "local";
    draft: ReviewWorkspaceDraft | null;
    runtimeWorkspace: WorkspaceStateV2 | null | undefined;
    runtimeUpdatedAt?: number | null;
    runtimeUserEdited?: boolean | null;
    runtimeOrigin?: string | null;
    runtimeProtected?: boolean | null;
}): WorkspaceStateV2 | null {
    if (args.draftStorageMode !== "local") {
        return args.runtimeWorkspace ?? null;
    }

    if (
        shouldUseLocalReviewDraft({
            draft: args.draft,
            runtimeWorkspace: args.runtimeWorkspace,
            runtimeUpdatedAt: args.runtimeUpdatedAt,
            runtimeUserEdited: args.runtimeUserEdited,
            runtimeOrigin: args.runtimeOrigin,
            runtimeProtected: args.runtimeProtected,
        })
    ) {
        return mergeMissingFilesFromRuntimeWorkspace(
            args.draft?.workspace ?? null,
            args.runtimeWorkspace,
        );
    }

    return args.runtimeWorkspace ?? null;
}

function forceWorkspaceHasContent(workspace: WorkspaceStateV2 | null | undefined) {
    // Non-review tool routes may intentionally open an empty file workspace.
    return workspaceHasAnyFile(workspace);
}

function reviewRuntimeWorkspaceIsUsable(runtime: any, workspace: WorkspaceStateV2 | null | undefined) {
    if (!workspace || !workspaceHasAnyFile(workspace)) return false;

    if (isProtectedReviewRuntimeState(runtime)) {
        return true;
    }

    /**
     * In review mode, starter/empty runtime workspaces are not useful unless they
     * actually contain starter text. Otherwise the right-rail editor mounts blank
     * and suppresses later starter hydration.
     */
    if (
        runtime?.workspaceOrigin === "empty" &&
        runtime?.workspaceSeedMode === "empty"
    ) {
        return true;
    }

    if (runtime?.workspaceOrigin === "starter" || runtime?.userEdited === false) {
        /**
         * A starter-owned runtime shell with only blank files is usually a
         * pre-hydration placeholder. SQL-v2 reaches the Tools/FullIDE path early
         * because it has dataset metadata, so that blank query.sql shell can
         * otherwise win over the later localized starter. Python avoids this
         * more often through embedded starter fallbacks.
         *
         * Keep multi-file starter shells available for fixture-driven labs, but
         * do not let a one-file blank starter suppress resolved starter code.
         */
        return reviewWorkspaceHasNonEmptyFile(workspace) || workspaceNeedsMultiFile(workspace);
    }

    if (runtime?.workspaceOrigin === "empty") {
        return workspaceHasAnyFile(workspace);
    }

    return workspaceHasAnyFile(workspace);
}

export function isUserOwnedReviewRuntimeState(value: any) {
    return (
        value?.userEdited === true ||
        value?.workspaceOrigin === "user" ||
        value?.workspaceOrigin === "saved"
    );
}

export function isCorrectReviewRuntimeState(value: any) {
    return value?.result?.ok === true || value?.correct === true;
}

export function isProtectedReviewRuntimeState(value: any) {
    /**
     * Only real learner/saved work is strongly protected.
     *
     * A correct result alone is NOT enough, because the result patch can arrive
     * with a starter workspace after validation/progress reload. If we treat
     * correct+starter as protected, CodeToolPane can render starter after
     * navigating next/back even though the exercise is correct.
     */
    return isUserOwnedReviewRuntimeState(value);
}

function selectReadyRuntimeWorkspace(
    runtime: any,
    effectiveLanguage: string | null | undefined,
) {
    const workspace = workspaceWithRuntimeEntryCode(runtime?.workspace, runtime);

    const readyWorkspace =
        runtime?.workspaceStatus === "ready" &&
        reviewRuntimeWorkspaceIsUsable(runtime, workspace) &&
        workspaceMatchesLanguage(workspace, effectiveLanguage)
            ? workspace
            : null;

    return readyWorkspace
        ? {
            workspace: readyWorkspace,
            updatedAt: Number(runtime?.updatedAt ?? 0),
            protectionRank: reviewRuntimeProtectionRank(runtime),
            runtime,
        }
        : null;
}

function runtimeWorkspaceTargetKeyOf(runtime: any) {
    const value =
        runtime?.targetKey ??
        runtime?.ownerKey ??
        runtime?.exerciseKey ??
        runtime?.cardRuntimeKey ??
        null;

    return value == null ? null : String(value);
}

function runtimeCandidateMatchesTarget(
    candidate: {
        runtime?: any;
    } | null,
    targetKey: string | null | undefined,
) {
    if (!candidate) return false;

    const normalizedTargetKey = targetKey == null ? null : String(targetKey);
    if (!normalizedTargetKey) return true;

    const candidateTargetKey = runtimeWorkspaceTargetKeyOf(candidate.runtime);
    if (!candidateTargetKey) return true;

    return candidateTargetKey === normalizedTargetKey;
}

function mergeMissingFilesFromRuntimeCandidates(
    selectedCandidate: {
        workspace: WorkspaceStateV2;
        runtime?: any;
    } | null,
    candidates: Array<{
        workspace: WorkspaceStateV2;
        runtime?: any;
    } | null>,
    targetKey: string | null | undefined,
) {
    let mergedWorkspace = selectedCandidate?.workspace ?? null;
    const selectedIsLearnerOwned = isUserOwnedReviewRuntimeState(
        selectedCandidate?.runtime,
    );

    for (const candidate of candidates) {
        if (!candidate?.workspace) continue;
        if (!runtimeCandidateMatchesTarget(candidate, targetKey)) continue;
        mergedWorkspace = mergeMissingFilesFromRuntimeWorkspace(
            mergedWorkspace,
            candidate.workspace,
            {
                hydrateBlankFiles: !selectedIsLearnerOwned,
            },
        );
    }

    return mergedWorkspace;
}

export function pickDirectReviewRuntimeWorkspace(args: {
    editorRuntime: any;
    exerciseRuntime: any;
    normalizedToolWorkspace: WorkspaceStateV2 | null | undefined;
    effectiveLanguage: string | null | undefined;
    targetKey?: string | null;
}) {
    const blockingRuntimeStatus =
        args.exerciseRuntime?.workspaceStatus === "pending" ||
        args.exerciseRuntime?.workspaceStatus === "error" ||
        args.editorRuntime?.workspaceStatus === "pending" ||
        args.editorRuntime?.workspaceStatus === "error";

    /**
     * In review exercise routes, the practice card and right-side editor must
     * share the same readiness contract. Do not let a route/registry starter or
     * a stale bound Tools workspace make the editor look ready while the card is
     * still loading or has failed to resolve its practice item.
     */
    if (blockingRuntimeStatus) {
        return null;
    }

    const editorCandidate = selectReadyRuntimeWorkspace(
        args.editorRuntime,
        args.effectiveLanguage,
    );
    const exerciseCandidate = selectReadyRuntimeWorkspace(
        args.exerciseRuntime,
        args.effectiveLanguage,
    );
    const readyCandidates = [editorCandidate, exerciseCandidate].filter(
        (candidate): candidate is NonNullable<typeof candidate> =>
            runtimeCandidateMatchesTarget(candidate, args.targetKey),
    );

    const userOwnedCandidates = readyCandidates
        .filter(
            (candidate): candidate is NonNullable<typeof candidate> =>
                Boolean(candidate && candidate.protectionRank >= 2),
        )
        .sort((a, b) => b.updatedAt - a.updatedAt);

    if (userOwnedCandidates.length > 0) {
        const selectedCandidate = userOwnedCandidates[0] ?? null;
        return mergeMissingFilesFromRuntimeCandidates(
            selectedCandidate,
            readyCandidates.filter((candidate) => candidate !== selectedCandidate),
            args.targetKey,
        );
    }

    const correctCandidates = readyCandidates
        .filter(
            (candidate): candidate is NonNullable<typeof candidate> =>
                Boolean(candidate && candidate.protectionRank === 1),
        )
        .sort((a, b) => b.updatedAt - a.updatedAt);

    if (correctCandidates.length > 0) {
        const selectedCandidate = correctCandidates[0] ?? null;
        return mergeMissingFilesFromRuntimeCandidates(
            selectedCandidate,
            readyCandidates.filter((candidate) => candidate !== selectedCandidate),
            args.targetKey,
        );
    }

    /**
     * For unedited starter state, the route exercise runtime is canonical. The
     * editor runtime can be registered one render earlier with a partially
     * localized multi-file shell, so preferring it here can make fixture files
     * such as models/car.py flash and then become blank after reset.
     */
    if (exerciseCandidate) {
        return mergeMissingFilesFromRuntimeCandidates(
            exerciseCandidate,
            readyCandidates.filter((candidate) => candidate !== exerciseCandidate),
            args.targetKey,
        );
    }

    if (editorCandidate) {
        return mergeMissingFilesFromRuntimeCandidates(
            editorCandidate,
            readyCandidates.filter((candidate) => candidate !== editorCandidate),
            args.targetKey,
        );
    }

    /**
     * Review-mode fallback must not use a blank right-rail tool workspace.
     * A blank fallback is the exact bug: the editor mounts empty and starter
     * hydration never becomes visible.
     */
    if (
        (
            reviewWorkspaceHasNonEmptyFile(args.normalizedToolWorkspace) ||
            workspaceNeedsMultiFile(args.normalizedToolWorkspace)
        ) &&
        workspaceMatchesLanguage(args.normalizedToolWorkspace, args.effectiveLanguage)
    ) {
        return args.normalizedToolWorkspace ?? null;
    }

    return null;
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

    const folders = (workspace.nodes as any[])
        .filter((node) => node?.kind === "folder")
        .map((node) => filePath(node))
        .filter(Boolean)
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
        stdin: typeof workspace.stdin === "string" ? `${workspace.stdin.length}:${fastTextHash(workspace.stdin)}` : "",
        activePath: activeNode ? filePath(activeNode) : null,
        entryPath: entryNode ? filePath(entryNode) : null,
        folders,
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

function workspaceFilePathsForDebug(workspace: WorkspaceStateV2 | null | undefined) {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return [];
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

    return (workspace.nodes as any[])
        .filter((node) => node?.kind === "file")
        .map((node) => {
            const name = String(node?.name ?? "");
            const parentId = node?.parentId == null ? null : String(node.parentId);
            const parentPath = parentId ? folderPathById.get(parentId) || "" : "";
            return parentPath ? `${parentPath}/${name}` : name;
        })
        .sort((a, b) => a.localeCompare(b));
}

function workspaceActiveFilePath(workspace: WorkspaceStateV2 | null | undefined) {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return null;
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

    const activeNode =
        (workspace.nodes as any[]).find(
            (node) => node?.kind === "file" && node.id === workspace.activeFileId,
        ) ??
        (workspace.nodes as any[]).find(
            (node) => node?.kind === "file" && node.id === workspace.entryFileId,
        ) ??
        (workspace.nodes as any[]).find((node) => node?.kind === "file");

    if (!activeNode) return null;

    const name = String(activeNode.name ?? "");
    const parentId = activeNode.parentId == null ? null : String(activeNode.parentId);
    const parentPath = parentId ? folderPathById.get(parentId) || "" : "";
    return parentPath ? `${parentPath}/${name}` : name;
}

function extractWorkspaceSnapshot(workspace: WorkspaceStateV2 | null) {
    return extractRuntimeSnapshotFromWorkspace(workspace);
}

function isExerciseEditorScope(value: string | null | undefined) {
    if (!value) return false;
    if (value === "general") return false;
    if (value.startsWith("card:")) return false;
    if (value.endsWith(":general")) return false;
    if (value.includes(":card:general")) return false;
    if (value.startsWith("code-runner:")) return false;
    return value.split(":").length >= 6;
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
    pendingExerciseBinding?: boolean;
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
    /**
     * Stack-wide browser-local persistence policy. "off" disables both this
     * pane's reviewWorkspaceDrafts layer and FullIDE's own local draft store.
     */
    draftStorageMode?: "off" | "local";
    sqlDialect?: SqlDialect;
    sqlDatasetId?: string;
    sqlResultShape?: "table";
    sqlPaneOptions?: SqlPaneOptions;
    runnerPaneOptions?: ToolRunnerPanePolicy;
    defaultSurface?: ToolSurface;
    sqlSchemaSql?: string;
    sqlSeedSql?: string;
    sqlSetupSql?: string;
    sqlInitialTableSnapshots?: SqlTableSnapshots;
}) {
    const t = useTranslations("ide.tools.pane");
    const {
        toolScopeKey,
        editorOwnerKey,
        pendingExerciseBinding = false,
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
        draftStorageMode = "local",
        sqlDialect = "sqlite",
        sqlDatasetId,
        sqlResultShape,
        sqlPaneOptions,
        runnerPaneOptions,
        defaultSurface,
        sqlSchemaSql,
        sqlSeedSql,
        sqlSetupSql,
        sqlInitialTableSnapshots,
    } = props;

    const localWorkspacePersistenceEnabled = draftStorageMode === "local";

    const tools = useReviewTools();
    const boundId = tools?.boundId ?? null;
    const previewExerciseKey = tools?.previewExerciseKey ?? null;
    const clearRunFeedback = tools?.clearRunFeedback;
    const setRunFeedbackForCard = tools?.setRunFeedback;
    const getRunFeedbackEntryForCard = tools?.getRunFeedbackEntry;
    const syncCodeInputSnapshot = tools?.syncCodeInputSnapshot;
    const runtimeBoundExerciseKey = useReviewRuntimeStore(
        (s) => s.tool.boundExerciseKey,
    );

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
        const scopedPreviewExerciseKey =
            !scopedToolKey &&
            !scopedBoundId &&
            previewExerciseKey &&
            isExerciseEditorScope(previewExerciseKey)
                ? previewExerciseKey
                : null;
        const scopedRuntimeBoundKey =
            boundId &&
            runtimeBoundExerciseKey &&
            isExerciseEditorScope(runtimeBoundExerciseKey) &&
            (
                runtimeBoundExerciseKey === boundId ||
                runtimeBoundExerciseKey.endsWith(`:${boundId}`)
            )
                ? runtimeBoundExerciseKey
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
        if (scopedRuntimeBoundKey) return scopedRuntimeBoundKey;
        if (scopedBoundId) return scopedBoundId;
        if (scopedPreviewExerciseKey) return scopedPreviewExerciseKey;
        if (rawToolScope) return rawToolScope;

        return "general";
    }, [toolScopeKey, boundId, previewExerciseKey, runtimeBoundExerciseKey]);

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
    const isReviewRouteMode = Boolean(resolvedEditorOwnerKey && hasBindableEditorTarget);
    const editorRuntime = useReviewRuntimeStore((s) =>
        resolvedEditorOwnerKey ? s.editorRuntimes[resolvedEditorOwnerKey] ?? null : null,
    );
    const runtimeResetRevision = useReviewRuntimeStore((s) => s.resetRevision);
    const [forceResetHydration, setForceResetHydration] = useState(false);
    const observedResetRevisionRef = useRef(runtimeResetRevision);
    const resetHydrationActive =
        forceResetHydration ||
        observedResetRevisionRef.current !== runtimeResetRevision;

    const subscribedExerciseRuntime = useReviewRuntimeStore((s) =>
        exerciseKey ? s.exercises[exerciseKey] ?? null : null,
    );
    const subscribedCardRuntime = useReviewRuntimeStore((s) =>
        cardRuntimeKey ? s.cards[cardRuntimeKey] ?? null : null,
    );
    const exerciseRuntime =
        subscribedExerciseRuntime ??
        (
            exerciseKey
                ? useReviewRuntimeStore.getState().exercises[exerciseKey] ?? null
                : null
        );
    const cardRuntime =
        subscribedCardRuntime ??
        (
            cardRuntimeKey
                ? useReviewRuntimeStore.getState().cards[cardRuntimeKey] ?? null
                : null
        );
    const cardRuntimeIdeConfig = (cardRuntime as { ideConfig?: LearningIdeConfig | null } | null)?.ideConfig ?? null;
    const effectivePaneIdeConfig = useMemo(
        () =>
            resolveEffectiveCodeToolPaneIdeConfig({
                propIdeConfig: ideConfig,
                exerciseIdeConfig: exerciseRuntime?.ideConfig ?? null,
                cardIdeConfig: cardRuntimeIdeConfig,
                isReviewRouteMode,
            }),
        [
            ideConfig,
            exerciseRuntime?.ideConfig,
            cardRuntimeIdeConfig,
            isReviewRouteMode,
        ],
    );
    const terminalSyncRef = useRef<(() => Promise<boolean>) | null>(null);

    const handleTerminalSyncReady = useCallback(
        (sync: (() => Promise<boolean>) | null) => {
            terminalSyncRef.current = sync;
        },
        [],
    );
    const patchEditorWorkspace = useReviewRuntimeStore((s) => s.patchEditorWorkspace);
    const patchExerciseRuntime = useReviewRuntimeStore((s) => s.patchExercise);
    /**
     * REVIEW DIRECT WORKSPACE MODE
     *
     * This bypasses the legacy bridge/hydration path for route-owned review
     * targets. If the current exercise/card runtime has a ready workspace,
     * that workspace is the only source for FullIDE.
     */
    const canonicalReviewRuntime = isExerciseEditorMode
        ? exerciseRuntime
        : isSketchEditorMode
            ? (
                cardRuntime
                    ? {
                        targetKey: cardRuntimeKey,
                        workspaceStatus: cardRuntime.workspaceStatus,
                        workspaceOrigin: cardRuntime.workspaceOrigin,
                        userEdited: cardRuntime.userEdited,
                        updatedAt: cardRuntime.updatedAt,
                        workspace: cardRuntime.toolWorkspace ?? null,
                    }
                    : null
            )
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

    const normalizedToolPair = useMemo(
        () =>
            normalizeCodeWorkspacePair({
                workspace: toolWorkspace,
                code: toolCode,
                state: {
                    workspaceOrigin: "sync",
                },
                language: toolLang,
                stdin: toolStdin,
            }),
        [toolWorkspace, toolCode, toolLang, toolStdin],
    );

    const normalizedToolWorkspace = normalizedToolPair.workspace;
    const hasEditorTarget = Boolean(
        hasBindableEditorTarget ||
        forceWorkspaceHasContent(canonicalReviewRuntime?.workspace) ||
        forceWorkspaceHasContent(normalizedToolWorkspace),
    );

    const runtimeLanguage =
        isReviewRouteMode && typeof exerciseRuntime?.language === "string"
            ? exerciseRuntime.language
            : isReviewRouteMode && typeof cardRuntime?.toolLang === "string"
                ? cardRuntime.toolLang
                : isReviewRouteMode && typeof editorRuntime?.language === "string"
                    ? editorRuntime.language
                    : null;

    const normalizedToolWorkspaceLanguage =
        typeof normalizedToolWorkspace?.language === "string"
            ? normalizedToolWorkspace.language
            : null;
    const canonicalReviewWorkspaceLanguage =
        isReviewRouteMode && typeof canonicalReviewRuntime?.workspace?.language === "string"
            ? canonicalReviewRuntime.workspace.language
            : null;
    const runtimeBackedLanguage =
        canonicalReviewWorkspaceLanguage ?? runtimeLanguage;

    const hasReadyDeterministicExerciseWorkspace = Boolean(
        exerciseRuntime?.workspaceStatus === "ready" &&
        forceWorkspaceHasContent(exerciseRuntime.workspace),
    );

    /**
     * Shared language-source rule:
     *
     * The route/exercise runtime is canonical once it has a ready workspace.
     * The bound tool workspace is only an early fallback for dynamic practice
     * items while their deterministic runtime seed has not arrived yet.
     */
    const shouldPreferBoundToolLanguage = Boolean(
        isReviewRouteMode &&
        !hasReadyDeterministicExerciseWorkspace &&
        normalizedToolWorkspaceLanguage &&
        runtimeBackedLanguage &&
        !languagesCompatible(normalizedToolWorkspaceLanguage, runtimeBackedLanguage),
    );

    const effectiveLanguage = shouldPreferBoundToolLanguage
        ? (normalizedToolWorkspaceLanguage as RunnerLanguage)
        : runtimeBackedLanguage ?? toolLang;
    const isSql = effectiveLanguage === "sql";
    const reviewTargetKey = resolvedEditorOwnerKey ?? exerciseKey ?? cardRuntimeKey ?? null;
    const reviewDirectWorkspace = useMemo(
        () =>
            isReviewRouteMode
                ? pickDirectReviewRuntimeWorkspace({
                    targetKey: reviewTargetKey,
                    editorRuntime,
                    exerciseRuntime: canonicalReviewRuntime,
                    normalizedToolWorkspace: resetHydrationActive
                        ? null
                        : normalizedToolWorkspace,
                    effectiveLanguage,
                })
                : null,
        [
            canonicalReviewRuntime,
            editorRuntime,
            effectiveLanguage,
            isReviewRouteMode,
            normalizedToolWorkspace,
            resetHydrationActive,
            reviewTargetKey,
        ],
    );
    const reviewDirectWorkspaceReady = !!reviewDirectWorkspace;
    const paneIdeMode = useMemo(
        () =>
            resolveCodeToolPaneFullIdeMode({
                ideConfig: effectivePaneIdeConfig,
                reviewDirectWorkspaceReady,
                effectiveLanguage,
            }),
        [effectiveLanguage, effectivePaneIdeConfig, reviewDirectWorkspaceReady],
    );
    const ideShell = paneIdeMode.ideShell;

// Important:
// Review runtime always passes a WorkspaceStateV2, even for one-file starters.
// So force workspace shell whenever review runtime has a ready workspace.
// Otherwise single-file starter can get stuck in the legacy "single" loading path.
    const usesWorkspaceShell = paneIdeMode.usesWorkspaceShell;
    const currentIdeConfigKey = useMemo(
        () => learningIdeConfigContentKey(effectivePaneIdeConfig),
        [effectivePaneIdeConfig],
    );
    const workspaceOwnerKey = resolvedEditorOwnerKey ?? editorExerciseStateKey ?? toolScopeKey ?? boundId ?? "general";
    const workspaceStarterHash = String(
        (resolvedEditorOwnerKey ? (editorRuntime as any)?.starterHash : null) ??
        (exerciseKey ? (canonicalReviewRuntime as any)?.starterHash : null) ??
        (cardRuntimeKey ? (cardRuntime as any)?.starterHash : null) ??
        "",
    ).trim();
    const workspaceOwnerIdentityKey = workspaceStarterHash
        ? `${workspaceOwnerKey}:starter:${workspaceStarterHash}`
        : workspaceOwnerKey;

    const workspaceContextKey = useMemo(
        () =>
            JSON.stringify({
                ownerKey: workspaceOwnerIdentityKey,
                starterHash: workspaceStarterHash,
                language: effectiveLanguage,
                sqlDatasetId: sqlDatasetId ?? "",
                sqlSchemaSql: sqlSchemaSql ?? sqlSetupSql ?? "",
                sqlSeedSql: sqlSeedSql ?? "",
                workspaceShell: usesWorkspaceShell,
                ideConfig: currentIdeConfigKey,
            }),
        [
            workspaceOwnerIdentityKey,
            workspaceStarterHash,
            sqlDatasetId,
            sqlSchemaSql,
            sqlSeedSql,
            sqlSetupSql,
            effectiveLanguage,
            usesWorkspaceShell,
            currentIdeConfigKey,
        ],
    );
    const runnerH = Math.max(usesWorkspaceShell ? 480 : 320, size.h);

    const [runFeedback, setRunFeedback] = useState<CodeFeedback | null>(null);
    const contextRunFeedback = boundId
        ? getRunFeedbackEntryForCard?.(boundId)?.feedback ?? null
        : null;
    const visibleRunFeedback =
        contextRunFeedback?.source === "check"
            ? contextRunFeedback
            : runFeedback ?? contextRunFeedback;
    const [ideReady, setIdeReady] = useState(false);
    const lastEmittedRef = useRef<{ code: string; stdin: string } | null>(null);
    const lastIncomingRef = useRef<{ code: string; stdin: string } | null>(null);
    const persistTimerRef = useRef<number | null>(null);
    const pendingWorkspaceRef = useRef<WorkspaceStateV2 | null | undefined>(undefined);
    const lastFlushedWorkspaceForSubmitRef = useRef<WorkspaceSubmitCache | null>(null);

    useEffect(() => {
        const cached = lastFlushedWorkspaceForSubmitRef.current;
        if (cached && cached.contextKey !== workspaceContextKey) {
            lastFlushedWorkspaceForSubmitRef.current = null;
        }
    }, [workspaceContextKey]);
    const pendingWorkspaceForceUserEditRef = useRef(false);
    const pendingTerminalEvidenceRef = useRef<TerminalEvidence | null | undefined>(undefined);
    const latestTerminalEvidenceRef = useRef<TerminalEvidence | null>(null);
    const lastTerminalEvidenceKeyRef = useRef<string>("");
    const lastHandledWorkspaceKeyRef = useRef<string>("");
    const lastHandledStructureKeyRef = useRef<string>("");
    const lastUpstreamWorkspaceKeyRef = useRef<string>("");
    const [localWorkspaceDraft, setLocalWorkspaceDraft] = useState<ReviewWorkspaceDraft | null>(null);

    useEffect(() => {
        if (
            !localWorkspacePersistenceEnabled ||
            !isReviewRouteMode ||
            !workspaceOwnerIdentityKey
        ) {
            setLocalWorkspaceDraft(null);
            return;
        }

        setLocalWorkspaceDraft(readReviewWorkspaceDraft(workspaceOwnerIdentityKey));
    }, [
        isReviewRouteMode,
        localWorkspacePersistenceEnabled,
        workspaceOwnerIdentityKey,
        workspaceContextKey,
    ]);

    useEffect(() => {
        if (localWorkspacePersistenceEnabled || !workspaceOwnerIdentityKey) return;

        // "off" is authoritative for the whole stack. Remove an older same-tab
        // snapshot so it cannot become eligible if this pane later remounts.
        clearReviewWorkspaceDraft(workspaceOwnerIdentityKey);
        setLocalWorkspaceDraft(null);
    }, [localWorkspacePersistenceEnabled, workspaceOwnerIdentityKey]);

    useLayoutEffect(() => {
        if (observedResetRevisionRef.current === runtimeResetRevision) return;

        observedResetRevisionRef.current = runtimeResetRevision;

        /**
         * Reset is authoritative. Cancel every same-tab editor snapshot before
         * the old Monaco value can be flushed back into the freshly cleared
         * runtime store. The new reset revision also remounts FullIDE below.
         */
        if (persistTimerRef.current != null) {
            window.clearTimeout(persistTimerRef.current);
            persistTimerRef.current = null;
        }

        pendingWorkspaceRef.current = undefined;
        pendingWorkspaceForceUserEditRef.current = false;
        pendingTerminalEvidenceRef.current = undefined;
        latestTerminalEvidenceRef.current = null;
        lastTerminalEvidenceKeyRef.current = "";
        lastHandledWorkspaceKeyRef.current = "";
        lastHandledStructureKeyRef.current = "";
        lastUpstreamWorkspaceKeyRef.current = "";
        lastEmittedRef.current = null;
        lastIncomingRef.current = null;

        setLocalWorkspaceDraft(null);
        setIdeReady(false);
        setForceResetHydration(true);
    }, [runtimeResetRevision]);

    const exerciseWorkspaceReady = Boolean(
        exerciseKey && forceWorkspaceHasContent(exerciseRuntime?.workspace),
    );

    const cardWorkspaceReady = Boolean(
        cardRuntimeKey && forceWorkspaceHasContent(cardRuntime?.toolWorkspace),
    );

    function createDefaultToolWorkspace(language: string | null | undefined): WorkspaceStateV2 {
        const now = Date.now();
        const normalizedLanguage = asWorkspaceLanguage(language);
        const fileName = defaultMainFile(normalizedLanguage);
        const fileId = `file:${fileName}`;

        return {
            version: 2,
            language: normalizedLanguage,
            nodes: [
                {
                    id: fileId,
                    kind: "file",
                    name: fileName,
                    parentId: null,
                    content: "",
                    createdAt: now,
                    updatedAt: now,
                },
            ],
            openTabs: [fileId],
            activeFileId: fileId,
            entryFileId: fileId,
            stdin: "",
            expanded: [],
            leftPct: 40,
        };
    }

    const runtimeWorkspaceError = Boolean(
        isReviewRouteMode && canonicalReviewRuntime?.workspaceStatus === "error",
    );
    const runtimeWorkspaceErrorMessage =
        firstNonBlankToolPaneString(
            (canonicalReviewRuntime as any)?.workspaceError,
            (canonicalReviewRuntime as any)?.error,
            (editorRuntime as any)?.workspaceError,
            (editorRuntime as any)?.error,
        ) || t("exerciseLoadFailed");

    const directRuntimeWorkspace = useMemo(() => {
        if (isReviewRouteMode) {
            return reviewDirectWorkspace;
        }

        // Normal tool/sketch route: blank file workspace is still valid.
        // This preserves the old behavior where an unbound sketch/editor can show
        // an empty editor and still save through onChangeWorkspace.
        if (
            forceWorkspaceHasContent(normalizedToolWorkspace) &&
            workspaceMatchesLanguage(normalizedToolWorkspace, effectiveLanguage)
        ) {
            return normalizedToolWorkspace ?? null;
        }

        return createDefaultToolWorkspace(effectiveLanguage);
    }, [
        isReviewRouteMode,
        reviewDirectWorkspace,
        normalizedToolWorkspace,
        effectiveLanguage,
    ]);
    const finalReviewRuntimeUserEdited = Boolean(
        canonicalReviewRuntime?.userEdited === true ||
        canonicalReviewRuntime?.workspaceOrigin === "user" ||
        canonicalReviewRuntime?.workspaceOrigin === "saved",
    );
    const finalReviewRuntimeProtected = Boolean(
        isUserOwnedReviewRuntimeState(canonicalReviewRuntime),
    );

    const finalReviewRuntimeOrigin = canonicalReviewRuntime?.workspaceOrigin;

    const finalReviewRuntimeUpdatedAt = Number(canonicalReviewRuntime?.updatedAt ?? 0);

    const finalReviewWorkspace = useMemo(() => {
        if (!isReviewRouteMode) return directRuntimeWorkspace;

        return resolveCodeToolPaneReviewWorkspace({
            draftStorageMode,
            draft: localWorkspaceDraft,
            runtimeWorkspace: directRuntimeWorkspace,
            runtimeUpdatedAt: finalReviewRuntimeUpdatedAt,
            runtimeUserEdited: finalReviewRuntimeUserEdited,
            runtimeOrigin: finalReviewRuntimeOrigin,
            runtimeProtected: finalReviewRuntimeProtected,
        });
    }, [
        directRuntimeWorkspace,
        draftStorageMode,
        finalReviewRuntimeOrigin,
        finalReviewRuntimeProtected,
        finalReviewRuntimeUpdatedAt,
        finalReviewRuntimeUserEdited,
        isReviewRouteMode,
        localWorkspaceDraft,
    ]);

    useEffect(() => {
        if (!forceResetHydration) return;

        const authoritativeStarterReady = Boolean(
            canonicalReviewRuntime?.workspaceStatus === "ready" &&
            canonicalReviewRuntime?.userEdited !== true &&
            canonicalReviewRuntime?.workspaceOrigin !== "user" &&
            canonicalReviewRuntime?.workspaceOrigin !== "saved" &&
            forceWorkspaceHasContent(canonicalReviewRuntime?.workspace) &&
            forceWorkspaceHasContent(finalReviewWorkspace),
        );

        if (!authoritativeStarterReady) return;

        /**
         * Keep FullIDE controlled for one task after the deterministic starter
         * arrives. This lets its external-workspace hydration effect replace the
         * pre-reset Monaco model before returning to local-first editing.
         */
        const timer = window.setTimeout(() => {
            setForceResetHydration(false);
        }, 0);

        return () => window.clearTimeout(timer);
    }, [
        canonicalReviewRuntime?.workspace,
        canonicalReviewRuntime?.workspaceOrigin,
        canonicalReviewRuntime?.workspaceStatus,
        canonicalReviewRuntime?.userEdited,
        finalReviewWorkspace,
        forceResetHydration,
    ]);



    const finalReviewWorkspaceLanguage = String(
        (finalReviewWorkspace as any)?.language ?? "",
    ).toLowerCase();

    const finalWorkspaceMatchesLanguage =
        !finalReviewWorkspaceLanguage ||
        !effectiveLanguage ||
        languagesCompatible(finalReviewWorkspaceLanguage, effectiveLanguage);
    const shouldHoldEditorForToolHydration = Boolean(
        isReviewRouteMode &&
        hasBindableEditorTarget &&
        !toolHydrated,
    );
    const shouldHoldEditorForPendingExerciseBinding = Boolean(
        pendingExerciseBinding,
    );
    const reviewWorkspaceNeedsMultiFile = Boolean(
        isReviewRouteMode &&
        [
            finalReviewWorkspace,
            directRuntimeWorkspace,
            canonicalReviewRuntime?.workspace,
            normalizedToolWorkspace,
            localWorkspacePersistenceEnabled
                ? localWorkspaceDraft?.workspace ?? null
                : null,
        ].some((workspace) => workspaceNeedsMultiFile(workspace)),
    );
    const runtimeWorkspacePending = Boolean(
        isReviewRouteMode &&
        !runtimeWorkspaceError &&
        (
            exerciseKey
                ? canonicalReviewRuntime?.workspaceStatus === "pending"
                : canonicalReviewRuntime?.workspaceStatus === "pending"
        ),
    );

    const isUnboundGeneralToolScope = Boolean(
        !hasBindableEditorTarget &&
        !pendingExerciseBinding &&
        !sqlDatasetId &&
        sqlResultShape !== "table" &&
        (
            editorExerciseStateKey === "general" ||
            editorExerciseStateKey.endsWith(":general")
        )
    );

    const shouldMountFullIde = Boolean(
        !isUnboundGeneralToolScope &&
        (
            hasBindableEditorTarget ||
            pendingExerciseBinding ||
            sqlDatasetId ||
            sqlResultShape === "table" ||
            !isReviewRouteMode
        )
    );

    useEffect(() => {
        if (!shouldMountFullIde) return;

        /**
         * Warm the IDE shell and Monaco bundle while the review/exercise workspace
         * is still loading so the editor is ready when the lesson content settles.
         */
        void preloadCodeToolPaneEditorAssets();
    }, [shouldMountFullIde]);

    const canRenderEditor = Boolean(
        shouldMountFullIde &&
        !shouldHoldEditorForToolHydration &&
        !shouldHoldEditorForPendingExerciseBinding &&
        !runtimeWorkspacePending &&
        finalReviewWorkspace &&
        !runtimeWorkspaceError &&
        finalWorkspaceMatchesLanguage &&
        forceWorkspaceHasContent(finalReviewWorkspace),
    );
    const shouldControlFullIdeWorkspace = Boolean(
        !isReviewRouteMode ||
        !ideReady ||
        pendingExerciseBinding ||
        resetHydrationActive,
    );
    /**
     * Do not show the editor loading fallback when the tools rail is not bound
     * to an exercise/sketch/code target. In that state there is no workspace to
     * wait for, so showing the timeout card makes normal lesson pages look
     * broken.
     */
    const shouldWaitForWorkspace = Boolean(
        (hasEditorTarget || pendingExerciseBinding) &&
        (
            shouldHoldEditorForToolHydration ||
            pendingExerciseBinding ||
            runtimeWorkspacePending ||
            (
                !isReviewRouteMode &&
                usesWorkspaceShell &&
                reviewWorkspaceHasNonEmptyFile(normalizedToolWorkspace)            )
        ),
    );

    const showLoadingMask =
        !runtimeWorkspaceError &&
        !canRenderEditor &&
        shouldWaitForWorkspace;

    const showWorkspaceError =
        runtimeWorkspaceError &&
        !canRenderEditor &&
        isReviewRouteMode &&
        hasBindableEditorTarget;

    const showNoEditorTarget =
        !runtimeWorkspaceError &&
        !canRenderEditor &&
        !showLoadingMask &&
        isReviewRouteMode &&
        !pendingExerciseBinding &&
        hasBindableEditorTarget;

    const [loadingTimedOut, setLoadingTimedOut] = useState(false);

    useEffect(() => {
        if (!showLoadingMask) {
            setLoadingTimedOut(false);
            return;
        }

        /**
         * In review exercise mode the exercise card is the canonical readiness
         * source. While it is still pending, the editor must wait with it instead
         * of showing a separate timeout card. A real exercise failure is mirrored
         * through runtimeWorkspaceError and rendered by showWorkspaceError.
         */
        if (pendingExerciseBinding || runtimeWorkspacePending) {
            return;
        }

        const timer = window.setTimeout(() => setLoadingTimedOut(true), 60000);
        return () => window.clearTimeout(timer);
    }, [showLoadingMask, workspaceContextKey, pendingExerciseBinding, runtimeWorkspacePending]);

    const retryEditorLoad = useCallback(() => {
        setLoadingTimedOut(false);
        if (resolvedEditorOwnerKey) {
            const runtimeApi = useReviewRuntimeStore.getState();
            const existing = runtimeApi.editorRuntimes[resolvedEditorOwnerKey];
            if (existing?.workspace) {
                runtimeApi.patchEditorWorkspace(resolvedEditorOwnerKey, existing.workspace, {
                    generation: runtimeResetRevision,
                    source: "code-tool-retry-load",
                });
            }
        }
    }, [resolvedEditorOwnerKey]);

    useEffect(() => {
        setIdeReady(false);
        lastEmittedRef.current = null;
        lastIncomingRef.current = null;
        pendingWorkspaceRef.current = undefined;
        pendingWorkspaceForceUserEditRef.current = false;
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
            workspaceOwnerIdentityKey,
            workspaceStarterHash,
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

    const emitWorkspaceUpstream = useCallback(
        (workspace: WorkspaceStateV2 | null, forceUserEdit = false) => {
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

            const shouldEmitCodeFields =
                forceUserEdit ||
                (
                    !isReviewRouteMode &&
                    !codeMatchesPreviousEmission &&
                    !codeMatchesIncomingProps
                );

            lastEmittedRef.current = next;
            const activePath = workspaceActiveFilePath(workspace);
            const workspaceMutation = shouldEmitCodeFields
                ? {
                    generation: runtimeResetRevision,
                    source: "code-tool-emit-upstream",
                    mutation: "user-content" as const,
                    changedFilePaths: activePath ? [activePath] : undefined,
                }
                : {
                    generation: runtimeResetRevision,
                    source: "code-tool-emit-upstream",
                    mutation: "runtime-sync" as const,
                };

            if ((!isReviewRouteMode || shouldEmitCodeFields) && boundId) {
                syncCodeInputSnapshot?.(boundId, {
                    generation: runtimeResetRevision,
                    workspaceMutation,
                    ...workspacePatch,
                    code: next.code,
                    source: next.code,
                    stdin: next.stdin,
                    codeStdin: next.stdin,
                    language: effectiveLanguage,
                    lang: effectiveLanguage,

                    updateOrigin: shouldEmitCodeFields ? "user" : "sync",
                    workspaceOrigin: shouldEmitCodeFields ? "user" : "sync",
                    preferSnapshot: shouldEmitCodeFields,

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
            }

            if (shouldEmitCodeFields && resolvedEditorOwnerKey && workspace) {
                patchEditorWorkspace(resolvedEditorOwnerKey, workspace, {
                    generation: runtimeResetRevision,
                    source: "code-tool-emit-upstream",
                    mutation: workspaceMutation,
                });
                if (localWorkspacePersistenceEnabled) {
                    writeReviewWorkspaceDraft(workspaceOwnerIdentityKey, workspace);
                    setLocalWorkspaceDraft({ savedAt: Date.now(), workspace });
                }

                /**
                 * In review-route mode the route runtime store is the source of truth.
                 * Do not also push every editor save through the outer tool callbacks.
                 * Those callbacks can re-register the right-rail tool and make Monaco
                 * feel like it reloads or loses keystrokes while the learner is typing.
                 */
                if (isReviewRouteMode) {
                    return;
                }

                onChangeWorkspace?.(workspace);
                onChangeCode(next.code);
                onChangeStdin(next.stdin);
                return;
            }

            if (isReviewRouteMode) {
                return;
            }

            onChangeWorkspace?.(workspace);

            if (!shouldEmitCodeFields) {
                return;
            }

            onChangeCode(next.code);
            onChangeStdin(next.stdin);
        },
        [
            boundId,
            effectiveLanguage,
            resolvedEditorOwnerKey,
            isReviewRouteMode,
            onChangeCode,
            onChangeStdin,
            onChangeWorkspace,
            localWorkspacePersistenceEnabled,
            patchEditorWorkspace,
            syncCodeInputSnapshot,
        ],
    );
    const emitWorkspaceUpstreamRef = useRef(emitWorkspaceUpstream);

    useEffect(() => {
        emitWorkspaceUpstreamRef.current = emitWorkspaceUpstream;
    }, [emitWorkspaceUpstream]);

    const flushPendingWorkspace = useCallback(() => {
        if (typeof pendingTerminalEvidenceRef.current !== "undefined" && boundId) {
            const nextEvidence = pendingTerminalEvidenceRef.current ?? null;
            pendingTerminalEvidenceRef.current = undefined;

            const nextKey = terminalEvidenceKeyOf(nextEvidence);
            if (lastTerminalEvidenceKeyRef.current !== nextKey) {
                lastTerminalEvidenceKeyRef.current = nextKey;

                syncCodeInputSnapshot?.(boundId, {
                    generation: runtimeResetRevision,
                    terminalEvidence: nextEvidence ?? undefined,
                    submitted: false,
                    feedbackDismissed: true,
                    dismissFeedbackOnEdit: true,
                    updatedAt: Date.now(),
                });
            }
        }

        if (persistTimerRef.current != null) {
            window.clearTimeout(persistTimerRef.current);
            persistTimerRef.current = null;
        }

        if (typeof pendingWorkspaceRef.current === "undefined") {
            return;
        }

        const pending = pendingWorkspaceRef.current;
        const forceUserEdit = pendingWorkspaceForceUserEditRef.current;
        pendingWorkspaceRef.current = undefined;
        pendingWorkspaceForceUserEditRef.current = false;
        emitWorkspaceUpstreamRef.current(pending, forceUserEdit);
    }, [boundId, syncCodeInputSnapshot]);

    useEffect(() => {
        if (!boundId) return;
        if (typeof pendingTerminalEvidenceRef.current === "undefined") return;

        flushPendingWorkspace();
    }, [boundId, flushPendingWorkspace]);

    const handleTerminalEvidenceChange = useCallback(
        (evidence: TerminalEvidence) => {
            latestTerminalEvidenceRef.current = evidence;
            pendingTerminalEvidenceRef.current = evidence;

            /**
             * Terminal evidence can arrive before the Tools binding has fully
             * propagated to the quiz card. Persist it against the current review
             * runtime key immediately so terminal-only checks do not lose the
             * transcript and report "Terminal activity missing".
             */
            if (isReviewRouteMode && resolvedEditorOwnerKey) {
                patchExerciseRuntime(resolvedEditorOwnerKey, {
                    generation: runtimeResetRevision,
                    terminalEvidence: evidence,
                    submitted: false,
                    feedbackDismissed: true,
                    dismissFeedbackOnEdit: true,
                    updatedAt: Date.now(),
                });
            }

            flushPendingWorkspace();
        },
        [
            flushPendingWorkspace,
            isReviewRouteMode,
            patchExerciseRuntime,
            resolvedEditorOwnerKey,
        ],
    );

    const handleWorkspaceChange = useCallback((
        workspace: WorkspaceStateV2 | null,
        meta?: { origin?: "user" | "sync" | "programmatic" },
    ) => {
        /**
         * FullIDE can briefly emit a null/blank workspace while its internal
         * workspace bridge is booting. In route-owned review mode the runtime
         * store is the source of truth, so that transient emission must not be
         * persisted back into the store.
         */
        if (
            isReviewRouteMode &&
            forceWorkspaceHasContent(finalReviewWorkspace) &&
            !forceWorkspaceHasContent(workspace)
        ) {
            return;
        }

        const isDirectUserWorkspaceEdit = meta?.origin === "user";
        const workspaceKey = workspaceKeyOf(workspace ?? null);
        const previousStructureKey = lastHandledStructureKeyRef.current;
        const nextStructureKey = workspaceStructureKeyOf(workspace ?? null);
        const structureChanged =
            previousStructureKey !== "" && previousStructureKey !== nextStructureKey;

        const isTerminalWorkspaceSync = Boolean(
            isReviewRouteMode &&
                usesWorkspaceShell &&
                effectiveLanguage === "bash" &&
                !isDirectUserWorkspaceEdit &&
                workspace &&
                forceWorkspaceHasContent(workspace) &&
                (
                    structureChanged ||
                    lastHandledWorkspaceKeyRef.current !== workspaceKey
                ),
        );

        const isEffectiveUserWorkspaceEdit =
            isDirectUserWorkspaceEdit || isTerminalWorkspaceSync;

        /**
         * Keep the SQL/review hydration-loop guard, but do not drop real terminal
         * filesystem snapshots. Terminal snapshots are how bash mkdir/touch/rm
         * changes reach quiz validation.
         */
        if (
            isReviewRouteMode &&
            !isDirectUserWorkspaceEdit &&
            !isTerminalWorkspaceSync
        ) {
            return;
        }

        /**
         * Critical:
         * Do this before syncCodeInputSnapshot.
         * Programmatic FullIDE hydration can emit the same workspace back upward.
         * If we write it before dedupe, SQL starter hydration can overwrite the
         * previously saved user query with a newer updatedAt.
         */
        if (lastHandledWorkspaceKeyRef.current === workspaceKey) {
            return;
        }

        lastHandledWorkspaceKeyRef.current = workspaceKey;
        lastHandledStructureKeyRef.current = nextStructureKey;

        const shouldDeferReviewEditorContentEdit = Boolean(
            isReviewRouteMode &&
            isDirectUserWorkspaceEdit &&
            !structureChanged &&
            workspace &&
            forceWorkspaceHasContent(workspace)
        );

        if (shouldDeferReviewEditorContentEdit) {
            /**
             * Keep Monaco local-first while the learner is actively typing.
             *
             * Do not push the workspace back into the route runtime from a typing
             * timer. That feedback loop re-enters FullIDE/CodeRunner with a new
             * controlled value and can make Monaco blink or briefly lose focus.
             *
             * The pending workspace is still flushed before Run/Check/submit, on
             * page hide, and on unmount. The lightweight same-tab draft below is
             * only a safety net for navigation/reload while typing.
             */
            pendingWorkspaceRef.current = workspace;
            pendingWorkspaceForceUserEditRef.current = true;

            if (persistTimerRef.current != null) {
                window.clearTimeout(persistTimerRef.current);
            }

            persistTimerRef.current = window.setTimeout(() => {
                persistTimerRef.current = null;

                const pending = pendingWorkspaceRef.current;
                if (
                    localWorkspacePersistenceEnabled &&
                    pending &&
                    forceWorkspaceHasContent(pending)
                ) {
                    writeReviewWorkspaceDraft(workspaceOwnerIdentityKey, pending);
                }
            }, 500);
            return;
        }

        if (
            isEffectiveUserWorkspaceEdit &&
            isReviewRouteMode &&
            workspace &&
            forceWorkspaceHasContent(workspace)
        ) {
            lastFlushedWorkspaceForSubmitRef.current = {
                contextKey: workspaceContextKey,
                workspace,
            };
            pendingWorkspaceRef.current = undefined;
            pendingWorkspaceForceUserEditRef.current = false;
            emitWorkspaceUpstreamRef.current(workspace, true);
            return;
        }


        if (isReviewRouteMode) {
            if (persistTimerRef.current != null) {
                window.clearTimeout(persistTimerRef.current);
                persistTimerRef.current = null;
            }

            pendingWorkspaceRef.current = undefined;
            emitWorkspaceUpstream(workspace, isEffectiveUserWorkspaceEdit);
            return;
        }

        if (!usesWorkspaceShell || structureChanged) {
            if (persistTimerRef.current != null) {
                window.clearTimeout(persistTimerRef.current);
                persistTimerRef.current = null;
            }

            pendingWorkspaceRef.current = undefined;
            emitWorkspaceUpstream(workspace, isEffectiveUserWorkspaceEdit);
            return;
        }

        pendingWorkspaceRef.current = workspace;
        pendingWorkspaceForceUserEditRef.current = isEffectiveUserWorkspaceEdit;

        if (persistTimerRef.current != null) {
            window.clearTimeout(persistTimerRef.current);
        }

        persistTimerRef.current = window.setTimeout(() => {
            persistTimerRef.current = null;
            const pending = pendingWorkspaceRef.current;
            const forceUserEdit = pendingWorkspaceForceUserEditRef.current;
            pendingWorkspaceRef.current = undefined;
            pendingWorkspaceForceUserEditRef.current = false;
            emitWorkspaceUpstreamRef.current(pending ?? null, forceUserEdit);
        }, 220);
    }, [
        boundId,
        effectiveLanguage,
        emitWorkspaceUpstream,
        finalReviewWorkspace,
        isReviewRouteMode,
        localWorkspacePersistenceEnabled,
        onChangeCode,
        onChangeStdin,
        onChangeWorkspace,
        patchExerciseRuntime,
        patchEditorWorkspace,
        resolvedEditorOwnerKey,
        syncCodeInputSnapshot,
        usesWorkspaceShell,
        workspaceContextKey,
    ]);

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

    const flushReviewWorkspaceForSubmit = useCallback(() => {
        const workspaceForSubmit = selectWorkspaceForSubmit({
            contextKey: workspaceContextKey,
            pendingWorkspace: pendingWorkspaceRef.current,
            lastFlushed: lastFlushedWorkspaceForSubmitRef.current,
            currentWorkspace: finalReviewWorkspace,
        });

        if (workspaceForSubmit && forceWorkspaceHasContent(workspaceForSubmit)) {
            lastFlushedWorkspaceForSubmitRef.current = {
                contextKey: workspaceContextKey,
                workspace: workspaceForSubmit,
            };
        }

        flushPendingWorkspace();

        if (
            isReviewRouteMode &&
            resolvedEditorOwnerKey &&
            workspaceForSubmit &&
            forceWorkspaceHasContent(workspaceForSubmit)
        ) {
            const next = extractWorkspaceSnapshot(workspaceForSubmit);

            /**
             * Monaco stays local-first while the learner types. Run and Check must
             * both bridge that pending editor value into the route runtime before
             * validation reads the exercise snapshot.
             */
            patchEditorWorkspace(resolvedEditorOwnerKey, workspaceForSubmit, {
                generation: runtimeResetRevision,
                source: "code-tool-before-submit",
            });
            if (localWorkspacePersistenceEnabled) {
                writeReviewWorkspaceDraft(
                    workspaceOwnerIdentityKey,
                    workspaceForSubmit,
                );
            }
            patchExerciseRuntime(resolvedEditorOwnerKey, {
                generation: runtimeResetRevision,
                language: effectiveLanguage,
                lang: effectiveLanguage,
                workspace: workspaceForSubmit,
                codeWorkspace: workspaceForSubmit,
                ideWorkspace: workspaceForSubmit,
                code: next.code,
                source: next.code,
                stdin: next.stdin,
                codeStdin: next.stdin,
                userEdited: true,
                workspaceOrigin: "user",
                submitted: false,
                feedbackDismissed: true,
                dismissFeedbackOnEdit: true,
                updatedAt: Date.now(),
            });

            return true;
        }

        return false;
    }, [
        effectiveLanguage,
        finalReviewWorkspace,
        flushPendingWorkspace,
        isReviewRouteMode,
        localWorkspacePersistenceEnabled,
        patchEditorWorkspace,
        patchExerciseRuntime,
        resolvedEditorOwnerKey,
        runtimeResetRevision,
        workspaceContextKey,
        workspaceOwnerIdentityKey,
    ]);

    const flushReviewWorkspaceForSubmitRef = useRef(
        flushReviewWorkspaceForSubmit,
    );
    flushReviewWorkspaceForSubmitRef.current = flushReviewWorkspaceForSubmit;

    const workspaceSubmitBridgeStateRef = useRef({
        effectiveLanguage,
        finalReviewWorkspace,
        resolvedEditorOwnerKey,
        workspaceOwnerKey,
    });
    workspaceSubmitBridgeStateRef.current = {
        effectiveLanguage,
        finalReviewWorkspace,
        resolvedEditorOwnerKey,
        workspaceOwnerKey,
    };

    const workspaceSubmitBridgeKeys = useMemo(
        () =>
            Array.from(
                new Set(
                    [
                        boundId,
                        resolvedEditorOwnerKey,
                        editorExerciseStateKey,
                        workspaceOwnerKey,
                        workspaceOwnerIdentityKey,
                    ]
                        .map((value) => String(value ?? "").trim())
                        .filter(Boolean),
                ),
            ),
        [
            boundId,
            editorExerciseStateKey,
            resolvedEditorOwnerKey,
            workspaceOwnerIdentityKey,
            workspaceOwnerKey,
        ],
    );
    const workspaceSubmitBridgeKey = workspaceSubmitBridgeKeys.join("\u0000");

    useEffect(() => {
        if (!isReviewRouteMode) return;

        const win = getReviewSubmitBridgeHost();
        if (!win) return;

        win.__zoeFlushWorkspaceBeforeSubmit ??= {};
        win.__zoeGetWorkspaceBeforeSubmit ??= {};

        const flush = async () => {
            const didFlush = flushReviewWorkspaceForSubmitRef.current();

            /**
             * Zustand writes are synchronous, but allow any registry subscribers
             * triggered by the same patch to complete before Check builds its
             * validation payload.
             */
            await Promise.resolve();
            return didFlush;
        };

        const getCurrentWorkspace = () => {
            const bridgeState = workspaceSubmitBridgeStateRef.current;
            const workspace = selectWorkspaceForSubmit({
                contextKey: workspaceContextKey,
                pendingWorkspace: pendingWorkspaceRef.current,
                lastFlushed: lastFlushedWorkspaceForSubmitRef.current,
                currentWorkspace: bridgeState.finalReviewWorkspace,
            });
            if (!workspace || !forceWorkspaceHasContent(workspace)) return null;

            const snapshot = extractWorkspaceSnapshot(workspace);
            return {
                ownerKey:
                    bridgeState.resolvedEditorOwnerKey ??
                    bridgeState.workspaceOwnerKey,
                workspace,
                code: snapshot.code,
                source: snapshot.code,
                stdin: snapshot.stdin,
                codeStdin: snapshot.stdin,
                language: bridgeState.effectiveLanguage,
                lang: bridgeState.effectiveLanguage,
                codeLang: bridgeState.effectiveLanguage,
            };
        };

        win.__zoeFlushAnyWorkspaceBeforeSubmit = flush;
        win.__zoeGetAnyWorkspaceBeforeSubmit = getCurrentWorkspace;

        for (const key of workspaceSubmitBridgeKeys) {
            win.__zoeFlushWorkspaceBeforeSubmit[key] = flush;
            win.__zoeGetWorkspaceBeforeSubmit[key] = getCurrentWorkspace;
        }

        return () => {
            for (const key of workspaceSubmitBridgeKeys) {
                if (win.__zoeFlushWorkspaceBeforeSubmit?.[key] === flush) {
                    delete win.__zoeFlushWorkspaceBeforeSubmit[key];
                }
                if (
                    win.__zoeGetWorkspaceBeforeSubmit?.[key] ===
                    getCurrentWorkspace
                ) {
                    delete win.__zoeGetWorkspaceBeforeSubmit[key];
                }
            }

            if (win.__zoeFlushAnyWorkspaceBeforeSubmit === flush) {
                delete win.__zoeFlushAnyWorkspaceBeforeSubmit;
            }
            if (win.__zoeGetAnyWorkspaceBeforeSubmit === getCurrentWorkspace) {
                delete win.__zoeGetAnyWorkspaceBeforeSubmit;
            }
        };
    }, [
        isReviewRouteMode,
        workspaceContextKey,
        workspaceSubmitBridgeKey,
    ]);

    const handleBeforeRun = useCallback(async () => {
        flushReviewWorkspaceForSubmit();

        setRunFeedback(null);
        if (boundId) clearRunFeedback?.(boundId);
        await onBeforeRun?.();
    }, [
        boundId,
        clearRunFeedback,
        flushReviewWorkspaceForSubmit,
        onBeforeRun,
    ]);

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
    const fullIdeExerciseStateKey = buildReviewFullIdeExerciseStateKey(
        workspaceOwnerIdentityKey,
        runtimeResetRevision,
    );
    const fullIdeKey = [
        fullIdeExerciseStateKey,
        effectiveLanguage,
        usesWorkspaceShell ? "workspace" : "single",
        reviewWorkspaceNeedsMultiFile ? "multi" : "mono",
        currentIdeConfigKey,
    ].join(":");
    const fullIdeLanguage = asWorkspaceLanguage(effectiveLanguage);
    const effectiveTerminalCwd =
        typeof effectivePaneIdeConfig?.terminalCwd === "string" && effectivePaneIdeConfig.terminalCwd.trim()
            ? effectivePaneIdeConfig.terminalCwd.trim()
            : undefined;
    useEffect(() => {
        if (!boundId) return;

        const win = getReviewSubmitBridgeHost();
        if (!win) return;

        win.__zoeFlushTerminalBeforeSubmit ??= {};

        win.__zoeFlushTerminalBeforeSubmit[boundId] = async () => {
            const sync = terminalSyncRef.current;
            if (sync) {
                await sync();
            }
        };

        return () => {
            delete win.__zoeFlushTerminalBeforeSubmit?.[boundId];
        };
    }, [boundId]);

    useEffect(() => {
        const win = getReviewSubmitBridgeHost();
        if (!win) return;

        win.__zoeFlushTerminalBeforeSubmit ??= {};
        win.__zoeGetTerminalEvidenceBeforeSubmit ??= {};

        const getLatestTerminalEvidence = () =>
            latestTerminalEvidenceRef.current ?? pendingTerminalEvidenceRef.current ?? null;
        const waitForTerminalFlushSettle = (delayMs = 0) =>
            new Promise<void>((resolve) => {
                const afterFrame = () => {
                    if (delayMs > 0) {
                        window.setTimeout(() => resolve(), delayMs);
                        return;
                    }

                    resolve();
                };

                const raf =
                    typeof window !== "undefined"
                        ? window.requestAnimationFrame
                        : undefined;

                if (typeof raf === "function") {
                    raf(() => afterFrame());
                    return;
                }

                window.setTimeout(afterFrame, 0);
            });

        const flush = async () => {
            const sync = terminalSyncRef.current;

            if (!sync) {
                flushPendingWorkspace();
                return false;
            }

            let result = false;

            /**
             * A command sent through xterm is only guaranteed to be written to the
             * PTY websocket. The shell can finish mkdir/touch/rm a little later.
             * Retry the same snapshot path used by Check across a short settle
             * window so validation sees terminal-created filesystem changes.
             */
            for (const delay of [75, 150, 250, 350]) {
                await waitForTerminalFlushSettle(delay);
                result = (await sync()) || result;
                flushPendingWorkspace();
            }

            await waitForTerminalFlushSettle();
            flushPendingWorkspace();

            return result;
        };

        win.__zoeFlushAnyTerminalBeforeSubmit = flush;
        win.__zoeGetAnyTerminalEvidenceBeforeSubmit = getLatestTerminalEvidence;

        const terminalRegistryKeys = Array.from(
            new Set(
                [
                    boundId,
                    resolvedEditorOwnerKey,
                    editorExerciseStateKey,
                    workspaceOwnerKey,
                    workspaceOwnerIdentityKey,
                ]
                    .map((value) => String(value ?? "").trim())
                    .filter(Boolean),
            ),
        );

        for (const key of terminalRegistryKeys) {
            win.__zoeFlushTerminalBeforeSubmit[key] = flush;
            win.__zoeGetTerminalEvidenceBeforeSubmit[key] = getLatestTerminalEvidence;
        }

        return () => {
            for (const key of terminalRegistryKeys) {
                if (win.__zoeFlushTerminalBeforeSubmit?.[key] === flush) {
                    delete win.__zoeFlushTerminalBeforeSubmit[key];
                }

                if (
                    win.__zoeGetTerminalEvidenceBeforeSubmit?.[key] ===
                    getLatestTerminalEvidence
                ) {
                    delete win.__zoeGetTerminalEvidenceBeforeSubmit[key];
                }
            }

            if (win.__zoeGetAnyTerminalEvidenceBeforeSubmit === getLatestTerminalEvidence) {
                delete win.__zoeGetAnyTerminalEvidenceBeforeSubmit;
            }

            if (win.__zoeFlushAnyTerminalBeforeSubmit === flush) {
                delete win.__zoeFlushAnyTerminalBeforeSubmit;
            }
        };
    }, [
        boundId,
        resolvedEditorOwnerKey,
        editorExerciseStateKey,
        workspaceOwnerKey,
        workspaceOwnerIdentityKey,
        flushPendingWorkspace,
    ]);
    useEffect(() => {
        if (typeof window === "undefined") return;
        (window as any).__ZOE_REVIEW_WORKSPACE_DEBUG__ = {
            editorPaths: workspaceFilePathsForDebug(editorRuntime?.workspace),
            exercisePaths: workspaceFilePathsForDebug(canonicalReviewRuntime?.workspace),
            directPaths: workspaceFilePathsForDebug(directRuntimeWorkspace),
            finalPaths: workspaceFilePathsForDebug(finalReviewWorkspace),
            editorStatus: String(editorRuntime?.workspaceStatus ?? ""),
            exerciseStatus: String(canonicalReviewRuntime?.workspaceStatus ?? ""),
            reviewTargetKey,
            resolvedEditorOwnerKey,
            exerciseKey,
            cardRuntimeKey,
            terminalCwd: effectiveTerminalCwd ?? null,
            propTerminalCwd:
                typeof ideConfig?.terminalCwd === "string" ? ideConfig.terminalCwd : null,
            exerciseRuntimeTerminalCwd:
                typeof exerciseRuntime?.ideConfig?.terminalCwd === "string"
                    ? exerciseRuntime.ideConfig.terminalCwd
                    : null,
            cardRuntimeTerminalCwd:
                typeof cardRuntimeIdeConfig?.terminalCwd === "string"
                    ? cardRuntimeIdeConfig.terminalCwd
                    : null,
        };
    }, [
        canonicalReviewRuntime?.workspace,
        canonicalReviewRuntime?.workspaceStatus,
        cardRuntimeKey,
        directRuntimeWorkspace,
        editorRuntime?.workspace,
        editorRuntime?.workspaceStatus,
        exerciseKey,
        finalReviewWorkspace,
        resolvedEditorOwnerKey,
        reviewTargetKey,
    ]);

    return (
        <div ref={ref} className="flex h-full min-h-0 w-full flex-col overflow-hidden">
            <div className="relative h-full min-h-0 flex-1">
                {canRenderEditor ? (
                    <FullIDE
                        key={fullIdeKey}
                        title={paneIdeMode.fullIdeTitle}
                        height={runnerH - 50}
                        fullHeight
                        language={fullIdeLanguage}
                        access={{
                            hasUser: true,
                            /**
                             * Review exercises may include runtime fixture files for any language:
                             * Python data.txt, JS package fixtures, C/C++ header/input files, Java
                             * helper files, etc.
                             *
                             * Do not gate these deterministic course workspaces behind the normal
                             * user multi-file entitlement. If this stays false, FullIDE normalizes the
                             * workspace down to one file and silently drops required fixtures.
                             */
                            canUseMultiFile:
                                isSql ||
                                ideShell.access.canUseMultiFile ||
                                reviewWorkspaceNeedsMultiFile,
                            canSaveCloud: ideShell.access.canSaveCloud,
                            canCreateProjects: ideShell.access.canCreateProjects,
                        }}
                        loginHref="/authenticate"
                        billingHref="/billing"
                        draftStorageMode={draftStorageMode}
                        servicePreset={ideShell.servicePreset}
                        forceDesktopLayout={paneIdeMode.forceDesktopLayout}
                        services={{
                            ...ideShell.services,
                            runner: {
                                ...(ideShell.services.runner ?? {}),
                                showThemeToggle: !learnerUiFlags.compactLearnerUi,
                                showSqlDialectPicker: false,
                                ...(effectiveTerminalCwd ? { terminalCwd: effectiveTerminalCwd } : {}),
                            },
                        }}
                        initialWorkspace={finalReviewWorkspace}
                        externalWorkspace={
                            shouldControlFullIdeWorkspace
                                ? finalReviewWorkspace
                                : undefined
                        }
                        exerciseStateKey={fullIdeExerciseStateKey}
                        projectScope={{
                            kind: "review-tool" as any,
                            scopeKey: `review-tool:${workspaceOwnerIdentityKey}`,
                        }}
                        onTerminalSyncReady={handleTerminalSyncReady}

                        onWorkspaceChange={handleWorkspaceChange}
                        onBeforeRun={handleBeforeRun}
                        onRunResult={handleRunResult}
                        onReadyChange={setIdeReady}
                        initialSqlDialect={sqlDialect}
                        sqlDatasetId={sqlDatasetId}
                        sqlResultShape={sqlResultShape}
                        sqlPaneOptions={sqlPaneOptions ?? ideShell.sqlPaneOptions}
                        runnerPaneOptions={runnerPaneOptions}
                        defaultSurface={defaultSurface}
                        sqlSchemaSql={sqlSchemaSql ?? sqlSetupSql}
                        sqlSeedSql={sqlSeedSql}
                        sqlSetupSql={sqlSetupSql}
                        sqlInitialTableSnapshots={sqlInitialTableSnapshots}
                        onTerminalEvidenceChange={handleTerminalEvidenceChange}
                    />
                ) : null}

                {pendingExerciseBinding && !canRenderEditor ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-950/35">
                        <div className="flex items-center gap-3 rounded-full border border-white/10 bg-black/40 px-4 py-2 text-sm font-semibold text-white/80">
                            <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />
                            Loading editor...
                        </div>
                    </div>
                ) : null}

                {showWorkspaceError ? (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-neutral-950/70 backdrop-blur-sm">
                        <div className="max-w-md rounded-2xl border border-white/10 bg-black/50 p-5 text-center text-white shadow-2xl">
                            <div className="text-sm font-semibold">Editor is waiting for the exercise.</div>
                            <div className="mt-2 text-xs text-white/65">
                                {runtimeWorkspaceErrorMessage}
                            </div>
                            <button
                                type="button"
                                onClick={retryEditorLoad}
                                className="mt-4 rounded-full bg-white px-4 py-2 text-xs font-bold text-neutral-950 hover:bg-white/90"
                            >
                                Retry editor
                            </button>
                        </div>
                    </div>
                ) : showLoadingMask ? (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-neutral-950/70 backdrop-blur-sm">
                        {loadingTimedOut ? (
                            <div className="max-w-md rounded-2xl border border-white/10 bg-black/50 p-5 text-center text-white shadow-2xl">
                                <div className="text-sm font-semibold">{t("editorSlowTitle")}</div>
                                <div className="mt-2 text-xs text-white/65">
                                    {t("editorSlowBody")}
                                </div>
                                <button
                                    type="button"
                                    onClick={retryEditorLoad}
                                    className="mt-4 rounded-full bg-white px-4 py-2 text-xs font-bold text-neutral-950 hover:bg-white/90"
                                >
                                    {t("retryEditor")}
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 rounded-full border border-white/10 bg-black/40 px-4 py-2 text-sm font-semibold text-white/80">
                                <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />
                                {pendingExerciseBinding
                                    ? t("loadingExercise")
                                    : cardRuntimeKey
                                        ? t("loadingSketchWorkspace")
                                        : t("loadingEditor")}
                            </div>
                        )}
                    </div>
                ) : showNoEditorTarget ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-950/20">
                        <div className="max-w-sm rounded-2xl border border-white/10 bg-black/35 p-5 text-center text-white/80 shadow-xl">
                            <div className="text-sm font-semibold text-white">
                                {isSketchEditorMode ? t("noSketchEditorBound") : t("noExerciseEditorBound")}
                            </div>

                            <div className="mt-2 text-xs leading-5 text-white/60">
                                {isSketchEditorMode
                                    ? t("sketchWorkspaceNotReady")
                                    : t("exerciseWorkspaceNotReady")}
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>

            {/*{!isSql && visibleRunFeedback ? (*/}
            {/*    <div className="mt-3">*/}
            {/*        <CodeFeedbackCallout feedback={visibleRunFeedback} />*/}
            {/*    </div>*/}
            {/*) : null}*/}
        </div>
    );
}
