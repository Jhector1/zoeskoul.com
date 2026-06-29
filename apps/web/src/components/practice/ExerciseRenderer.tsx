"use client";

import React, {useCallback, useEffect, useMemo, useRef} from "react";
import type {Exercise, SqlDialect} from "@/lib/practice/types";
import type {VectorPadState} from "@/components/vectorpad/types";

import NumericExerciseUI from "./kinds/NumericExerciseUI";
import SingleChoiceExerciseUI from "./kinds/SingleChoiceExerciseUI";
import MultiChoiceExerciseUI from "./kinds/MultiChoiceExerciseUI";
import VectorDragTargetExerciseUI from "./kinds/VectorDragTargetExerciseUI";
import VectorDragDotExerciseUI from "./kinds/VectorDragDotExerciseUI";
import CodeInputExerciseUI from "./kinds/CodeInputExerciseUI";
import TextInputExerciseUI from "./kinds/TextInputExerciseUI";
import DragReorderExerciseUI from "./kinds/DragReorderExerciseUI";
import VoiceInputExerciseUI from "./kinds/VoiceInputExerciseUI";

import type {QItem} from "./practiceType";
import MatrixInputPanel from "./MatrixInputPanel";
import {resizeGrid} from "@/lib/practice/matrixHelpers";
import FillBlankChoiceExerciseUI from "@/components/practice/kinds/FillBlankChoiceExerciseUI";
import ListenBuildExerciseUI from "@/components/practice/kinds/ListenBuildExerciseUI";
import {resolveDeepTagged} from "@/i18n/resolveDeepTagged";
import {useTaggedT} from "@/i18n/tagged";
import type {RunnerLanguage} from "@zoeskoul/code-contracts";
import type {LearningIdeConfig} from "@/lib/ide/learningIdeConfig";
import type {WorkspaceStateV2} from "@/components/ide/types";
import {useReviewRuntimeStore} from "@/components/review/module/runtime/reviewRuntimeStore";
import {getExerciseStateKey} from "@/components/review/module/runtime/exerciseKeys";
import {resolveSqlRunnerConfig} from "@/lib/subjects/sql/sql/runtime/resolveSqlRunnerConfig";
import type { SqlPaneOptions } from "@/components/code/runner/components/sql/results-pane";

import {resolveExerciseWorkspace, deriveEntryCode} from "@/components/review/module/runtime/exerciseWorkspaceResolver";
import {
    getStateLanguage,
    normalizeCodeWorkspacePair,
    normalizeWorkspaceLanguage,
    stateLanguageMatches,
} from "@/components/review/module/runtime/workspaceCodeSource";
import {
    resolveWorkspaceForExerciseTarget,
    resolveWorkspaceForTarget,
} from "@/components/review/module/runtime/resolveWorkspaceForTarget";
import { isUsableStarterCode } from "@/components/review/module/runtime/starterContent";

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
type RuntimeDefaultsLike = {
    fixedSqlDialect?: SqlDialect;
    datasetId?: string;
    resultShape?: "table";
    showSchema?: boolean;
    showErd?: boolean;
    showChen?: boolean;
    showTables?: boolean;
} | null;

type CodeInputExerciseWithSqlExtras = Extract<Exercise, { kind: "code_input" }> & {
    sqlSchemaSql?: string;
    sqlSeedSql?: string;
    sqlSetupSql?: string;
    sqlDatasetId?: string;
    sqlInitialTableSnapshots?: SqlTableSnapshots;
    topicRuntimeDefaults?: {
        fixedSqlDialect?: SqlDialect;
        datasetId?: string;
    } | null;
    moduleRuntimeDefaults?: {
        fixedSqlDialect?: SqlDialect;
        datasetId?: string;
    } | null;
    sectionRuntimeDefaults?: RuntimeDefaultsLike;
    courseRuntimeDefaults?: RuntimeDefaultsLike;
    subjectRuntimeDefaults?: RuntimeDefaultsLike;
};

type CodeToolsApi = {
    registerCodeInput: (
        id: string,
        args: {
            exerciseKey?: string;
            lang: RunnerLanguage;
            code: string;
            stdin?: string;
            ideConfig?: LearningIdeConfig | null;
            workspace?: WorkspaceStateV2 | null;
            ownerCardId?: string | null;
            preferSnapshot?: boolean;

            sqlDialect?: SqlDialect;
            sqlDatasetId?: string;
            sqlSchemaSql?: string;
            sqlSeedSql?: string;
            sqlInitialTableSnapshots?: SqlTableSnapshots;
            sqlPaneOptions?: SqlPaneOptions;

            onPatch: (patch: any) => void;
        },
    ) => void;
    unregisterCodeInput: (id: string) => void;

    requestBind: (id: string) => void;
    requestBindNext: (afterId: string) => void;
    unbindCodeInput: () => void;

    isBound: (id: string) => boolean;
    boundId: string | null;

    ensureVisible?: () => void;

    getRunFeedbackEntry?: (id: string) => { feedback: any | null; tick: number } | null;
    setRunFeedback?: (id: string, feedback: any | null) => void;
    clearRunFeedback?: (id: string) => void;

    syncCodeInputSnapshot?: (id: string, patch: any) => void;
    patchCodeInput?: (id: string, patch: any) => void;
    sketch?: any;
};

function getStableExerciseId(args: {
    exerciseStateId?: string;
    exercise?: any;
    current?: any;
}) {
    const {exerciseStateId, exercise, current} = args;

    return (
        exerciseStateId ||
        exercise?.exerciseKey ||
        exercise?.stableKey ||
        exercise?.key ||
        current?.exerciseKey ||
        current?.stableExerciseId ||
        current?.key ||
        exercise?.id ||
        "default"
    );
}

function codeWorkspacePatch(
    workspace: WorkspaceStateV2,
    language?: RunnerLanguage | string | null,
) {
    const code = deriveEntryCode(workspace) ?? "";
    const stdin = workspace.stdin ?? "";
    const lang = (workspace.language || language || "python") as RunnerLanguage;

    return {
        workspace,
        codeWorkspace: workspace,
        ideWorkspace: workspace,
        code,
        source: code,
        stdin,
        codeStdin: stdin,
        language: lang,
        codeLang: lang,
        lang,
        userEdited: true,
        workspaceOrigin: "user",
        updatedAt: Date.now(),
    };
}


function isRecordLike(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasNonBlankStarterCodeLike(value: unknown) {
    return typeof value === "string" && value.trim().length > 0;
}

function hasUsableStarterFilesLike(value: unknown): boolean {
    if (Array.isArray(value)) {
        return value.some((file) => {
            if (!isRecordLike(file)) return false;
            return typeof file.content === "string" && file.content.trim().length > 0;
        });
    }

    if (isRecordLike(value)) {
        return Object.entries(value).some(([key, entry]) => {
            if (
                [
                    "entryFile",
                    "entryFilePath",
                    "mainFile",
                    "mainFilePath",
                    "language",
                    "lang",
                ].includes(key)
            ) {
                return false;
            }

            if (typeof entry === "string") return entry.trim().length > 0;
            if (isRecordLike(entry) && typeof entry.content === "string") {
                return entry.content.trim().length > 0;
            }

            return false;
        });
    }

    return false;
}

function firstUsableStarterFilesLike(...values: unknown[]) {
    for (const value of values) {
        if (hasUsableStarterFilesLike(value)) return value;
    }

    return undefined;
}

function isTaggedMessageRefLike(value: unknown) {
    return typeof value === "string" && value.trim().startsWith("@:");
}

function hasResolvedStarterCodeLike(value: unknown) {
    return hasNonBlankStarterCodeLike(value) && !isTaggedMessageRefLike(value);
}

function hasResolvedStarterFilesLike(value: unknown) {
    if (!Array.isArray(value)) return false;

    return value.some((entry) => {
        if (typeof entry === "string") {
            return entry.trim().length > 0 && !isTaggedMessageRefLike(entry);
        }

        if (isRecordLike(entry) && typeof entry.content === "string") {
            return entry.content.trim().length > 0 && !isTaggedMessageRefLike(entry.content);
        }

        return false;
    });
}

function firstResolvedStarterFilesLike(...values: unknown[]) {
    for (const value of values) {
        if (hasResolvedStarterFilesLike(value)) return value;
    }

    return firstUsableStarterFilesLike(...values);
}

function mergeRenderedExerciseWithRouteManifest(
    renderedExercise: unknown,
    routeManifest: unknown,
) {
    const rendered = isRecordLike(renderedExercise) ? renderedExercise : {};
    const routed = isRecordLike(routeManifest) ? routeManifest : null;

    if (!routed) return renderedExercise;

    const renderedWorkspace = isRecordLike(rendered.workspace) ? rendered.workspace : {};
    const routedWorkspace = isRecordLike(routed.workspace) ? routed.workspace : {};

    /**
     * Route registry entries are manifest-shaped and can still contain raw
     * i18n tags such as "@:topics...starterCode". The rendered exercise has
     * already passed through useTaggedT/resolveDeepTagged, so prefer the
     * rendered resolved starter over an unresolved routed manifest starter.
     *
     * Without this, direct real catalog exercise routes can bind Tools with a
     * blank/raw starter even though the same embedded Try It resolves correctly.
     */
    const starterCode =
        hasResolvedStarterCodeLike(rendered.starterCode)
            ? rendered.starterCode
            : hasResolvedStarterCodeLike(renderedWorkspace.starterCode)
                ? renderedWorkspace.starterCode
                : hasResolvedStarterCodeLike(routed.starterCode)
                    ? routed.starterCode
                    : hasResolvedStarterCodeLike(routedWorkspace.starterCode)
                        ? routedWorkspace.starterCode
                        : hasNonBlankStarterCodeLike(rendered.starterCode)
                            ? rendered.starterCode
                            : hasNonBlankStarterCodeLike(renderedWorkspace.starterCode)
                                ? renderedWorkspace.starterCode
                                : hasNonBlankStarterCodeLike(routed.starterCode)
                                    ? routed.starterCode
                                    : routedWorkspace.starterCode;

    const starterFiles = firstResolvedStarterFilesLike(
        rendered.starterFiles,
        renderedWorkspace.starterFiles,
        routed.starterFiles,
        routedWorkspace.starterFiles,
    );

    return {
        ...rendered,
        ...routed,

        starterCode,
        starterFiles,

        workspace: {
            ...renderedWorkspace,
            ...routedWorkspace,
            starterCode,
            starterFiles,
            entryFile:
                routedWorkspace.entryFile ??
                routedWorkspace.entryFilePath ??
                renderedWorkspace.entryFile ??
                renderedWorkspace.entryFilePath,
            entryFilePath:
                routedWorkspace.entryFilePath ??
                routedWorkspace.entryFile ??
                renderedWorkspace.entryFilePath ??
                renderedWorkspace.entryFile,
            language:
                routedWorkspace.language ??
                routed.language ??
                renderedWorkspace.language ??
                rendered.language,
        },
    };
}

function firstNonBlank(...values: Array<string | null | undefined>) {
    for (const value of values) {
        if (typeof value === "string" && value.trim()) return value;
    }
    return undefined;
}

function getWorkspaceFromAnyState(value: any): WorkspaceStateV2 | null {
    if (value?.workspace?.version === 2) return value.workspace as WorkspaceStateV2;
    if (value?.codeWorkspace?.version === 2) return value.codeWorkspace as WorkspaceStateV2;
    if (value?.ideWorkspace?.version === 2) return value.ideWorkspace as WorkspaceStateV2;
    return null;
}

function hasNonBlankSqlSignal(value: unknown) {
    return typeof value === "string" && value.trim().length > 0;
}

function isSqlExerciseManifest(exercise: CodeInputExerciseWithSqlExtras | null | undefined) {
    if (!exercise) return false;

    return (
        exercise.language === "sql" ||
        hasNonBlankSqlSignal((exercise as any)?.fixedSqlDialect) ||
        hasNonBlankSqlSignal((exercise as any)?.runtime?.datasetId) ||
        hasNonBlankSqlSignal(exercise.sqlDatasetId) ||
        hasNonBlankSqlSignal(exercise.sqlSchemaSql) ||
        hasNonBlankSqlSignal(exercise.sqlSeedSql) ||
        hasNonBlankSqlSignal((exercise as any)?.sqlSetupSql)
    );
}

function getManifestExerciseLanguage(
    exercise: CodeInputExerciseWithSqlExtras | null | undefined,
): RunnerLanguage {
    if (isSqlExerciseManifest(exercise)) return "sql";

    return normalizeWorkspaceLanguage(
        exercise?.language ?? "python",
    ) as RunnerLanguage;
}

function resolveCodeInputIdeConfig(
    exercise: CodeInputExerciseWithSqlExtras,
): LearningIdeConfig | null {
    const explicit = (exercise as any).ideConfig;
    if (explicit && typeof explicit === "object") {
        return explicit as LearningIdeConfig;
    }

    const recipe = (exercise as any).recipe;
    if (
        recipe &&
        typeof recipe === "object" &&
        recipe.type === "shell_task" &&
        recipe.mode === "terminal_workspace"
    ) {
        return {
            runnerBackend: "pty",
            layoutMode: "terminal_workspace",
            terminalSessionScope:
                (exercise as any)?.serviceOverrides?.terminalSessionScope ??
                (exercise as any)?.runtime?.terminalSessionScope ??
                "exercise",
            fileActions: {
                enabled: false,
            },
            requires: {
                files: true,
                multiFile: true,
                terminal: true,
            },
        };
    }

    return null;
}


function workspaceHasNonBlankFile(workspace: WorkspaceStateV2 | null | undefined) {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return false;
    }

    return workspace.nodes.some((node: any) => {
        if (node?.kind !== "file") return false;
        return String(node.content ?? "").trim().length > 0;
    });
}

function workspaceHasAnyFile(workspace: WorkspaceStateV2 | null | undefined) {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return false;
    }

    return workspace.nodes.some((node: any) => node?.kind === "file");
}

function workspaceFilePaths(workspace: WorkspaceStateV2 | null | undefined) {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return new Set<string>();
    }

    const nodes = workspace.nodes as any[];
    const byId = new Map(nodes.map((node) => [String(node.id ?? ""), node] as const));

    const pathForId = (nodeId: string | null | undefined) => {
        if (!nodeId) return "";

        const parts: string[] = [];
        let currentId: string | null = String(nodeId);

        while (currentId) {
            const node = byId.get(currentId);
            if (!node) break;

            const name = String(node.name ?? "");
            if (name) parts.unshift(name);
            currentId = node.parentId == null ? null : String(node.parentId);
        }

        return parts.join("/");
    };

    return new Set(
        nodes
            .filter((node) => node?.kind === "file")
            .map((node) => pathForId(String(node.id ?? "")))
            .filter(Boolean),
    );
}

function workspaceIncludesStarterFiles(args: {
    savedWorkspace: WorkspaceStateV2 | null | undefined;
    starterWorkspace: WorkspaceStateV2 | null | undefined;
}) {
    const { savedWorkspace, starterWorkspace } = args;
    const starterPaths = workspaceFilePaths(starterWorkspace);

    if (starterPaths.size === 0) return true;

    const savedPaths = workspaceFilePaths(savedWorkspace);

    for (const path of starterPaths) {
        if (!savedPaths.has(path)) {
            return false;
        }
    }

    return true;
}


type WorkspacePathIndex = {
    pathById: Map<string, string>;
    idByPath: Map<string, string>;
};

function workspacePathIndex(workspace: WorkspaceStateV2 | null | undefined): WorkspacePathIndex {
    const pathById = new Map<string, string>();
    const idByPath = new Map<string, string>();

    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return {pathById, idByPath};
    }

    const nodesById = new Map<string, any>();
    for (const node of workspace.nodes as any[]) {
        const id = String(node?.id ?? "");
        if (id) nodesById.set(id, node);
    }

    const resolvePath = (id: string, seen = new Set<string>()): string => {
        if (pathById.has(id)) return pathById.get(id)!;
        if (seen.has(id)) return "";
        seen.add(id);

        const node = nodesById.get(id);
        if (!node) return "";

        const name = String(node.name ?? "").trim();
        if (!name) return "";

        const parentId = node.parentId == null ? "" : String(node.parentId);
        const parentPath = parentId ? resolvePath(parentId, seen) : "";
        const path = parentPath ? `${parentPath}/${name}` : name;
        pathById.set(id, path);
        idByPath.set(path, id);
        return path;
    };

    for (const id of nodesById.keys()) {
        resolvePath(id);
    }

    return {pathById, idByPath};
}

function uniqueWorkspaceNodeId(base: string, usedIds: Set<string>) {
    const cleanBase = String(base || "node").replace(/[^A-Za-z0-9_-]/g, "-") || "node";
    let candidate = cleanBase;
    let i = 1;

    while (usedIds.has(candidate)) {
        candidate = `${cleanBase}-${i}`;
        i += 1;
    }

    usedIds.add(candidate);
    return candidate;
}

function mergeMissingStarterWorkspaceFiles(
    workspace: WorkspaceStateV2 | null | undefined,
    starterWorkspace: WorkspaceStateV2 | null | undefined,
): WorkspaceStateV2 | null {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return starterWorkspace ?? null;
    }

    if (!starterWorkspace || starterWorkspace.version !== 2 || !Array.isArray(starterWorkspace.nodes)) {
        return workspace;
    }

    const starterFilePaths = workspaceFilePaths(starterWorkspace);
    if (starterFilePaths.size === 0) return workspace;

    const workspaceFiles = workspaceFilePaths(workspace);
    let missingAnyStarterFile = false;
    for (const path of starterFilePaths) {
        if (!workspaceFiles.has(path)) {
            missingAnyStarterFile = true;
            break;
        }
    }

    if (!missingAnyStarterFile) return workspace;

    const targetIndex = workspacePathIndex(workspace);
    const starterIndex = workspacePathIndex(starterWorkspace);
    const usedIds = new Set<string>(
        (workspace.nodes as any[])
            .map((node) => String(node?.id ?? ""))
            .filter(Boolean),
    );
    const pathToId = new Map(targetIndex.idByPath);
    const addedIdByStarterId = new Map<string, string>();
    const nextNodes = [...(workspace.nodes as any[])];

    const sortedStarterNodes = [...(starterWorkspace.nodes as any[])]
        .filter((node) => node?.kind === "folder" || node?.kind === "file")
        .sort((a, b) => {
            const aPath = starterIndex.pathById.get(String(a.id ?? "")) ?? "";
            const bPath = starterIndex.pathById.get(String(b.id ?? "")) ?? "";
            const aDepth = aPath ? aPath.split("/").length : 0;
            const bDepth = bPath ? bPath.split("/").length : 0;
            if (aDepth !== bDepth) return aDepth - bDepth;
            if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
            return aPath.localeCompare(bPath);
        });

    for (const starterNode of sortedStarterNodes) {
        const starterId = String(starterNode?.id ?? "");
        const path = starterIndex.pathById.get(starterId);
        if (!starterId || !path) continue;

        const existingId = pathToId.get(path);
        if (existingId) {
            addedIdByStarterId.set(starterId, existingId);
            continue;
        }

        const parentStarterId = starterNode.parentId == null ? "" : String(starterNode.parentId);
        const parentId = parentStarterId
            ? addedIdByStarterId.get(parentStarterId) ??
              pathToId.get(
                  (starterIndex.pathById.get(parentStarterId) ?? "")
              ) ??
              null
            : null;

        const nextId = uniqueWorkspaceNodeId(starterId, usedIds);
        addedIdByStarterId.set(starterId, nextId);
        pathToId.set(path, nextId);

        nextNodes.push({
            ...starterNode,
            id: nextId,
            parentId,
        });
    }

    return {
        ...workspace,
        nodes: nextNodes,
    };
}

function isUserOwnedWorkspaceState(value: any) {
    return (
        value?.userEdited === true ||
        value?.workspaceOrigin === "user" ||
        value?.workspaceOrigin === "saved"
    );
}

export function resolvePreferredExerciseWorkspace(args: {
    savedState: any;
    savedWorkspace: WorkspaceStateV2 | null | undefined;
    starterWorkspace: WorkspaceStateV2 | null | undefined;
}) {
    const { savedState, savedWorkspace, starterWorkspace } = args;

    if (!savedWorkspace || savedWorkspace.version !== 2) {
        return starterWorkspace ?? null;
    }

    const starterHasContent = workspaceHasNonBlankFile(starterWorkspace);
    const savedHasContent = workspaceHasNonBlankFile(savedWorkspace);
    const savedHasFileShell = workspaceHasAnyFile(savedWorkspace);

    /**
     * Important:
     * old buggy saves could mark an empty workspace as "saved"/user-owned.
     * That is not meaningful learner work, so it must not override starter code.
     */
    if (isUserOwnedWorkspaceState(savedState)) {
        if (!savedHasFileShell && starterHasContent && !savedHasContent) {
            return starterWorkspace ?? savedWorkspace;
        }
        return savedWorkspace;
    }

    /**
     * Do not let a blank non-user pending/sync workspace erase real starter code.
     * This is the race that can leave the Tools editor blank on first load.
     */
    if (starterHasContent && !savedHasContent) {
        return starterWorkspace ?? savedWorkspace;
    }

    /**
     * Non-user hydration/sync snapshots must not hide starter fixture files.
     * If the manifest workspace contains helper files/folders missing from the
     * saved snapshot, prefer the manifest workspace so Tools mounts correctly.
     */
    if (
        starterWorkspace &&
        !workspaceIncludesStarterFiles({
            savedWorkspace,
            starterWorkspace,
        })
    ) {
        return starterWorkspace;
    }

    return savedWorkspace;
}

function stableIdeConfigKeyForExerciseRenderer(value: unknown): string {
    const normalize = (input: unknown): unknown => {
        if (Array.isArray(input)) {
            return input.map(normalize);
        }

        if (input && typeof input === "object") {
            return Object.fromEntries(
                Object.entries(input as Record<string, unknown>)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([key, val]) => [key, normalize(val)]),
            );
        }

        return input ?? null;
    };

    return JSON.stringify(normalize(value ?? null));
}

function workspaceContentKeyForExerciseRenderer(workspace: WorkspaceStateV2 | null | undefined) {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return JSON.stringify(workspace ?? null);
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
            const parent = parentId ? folderPathById.get(parentId) || "" : "";
            folderPathById.set(id, parent ? `${parent}/${name}` : name);
            changed = true;
        }
    }

    const nodePath = (node: any) => {
        const name = String(node?.name ?? "");
        const parentId = node?.parentId == null ? null : String(node.parentId);
        const parent = parentId ? folderPathById.get(parentId) || "" : "";
        return parent ? `${parent}/${name}` : name;
    };

    const files = (workspace.nodes as any[])
        .filter((node) => node?.kind === "file")
        .map((node) => ({
            path: nodePath(node),
            content: String(node.content ?? ""),
        }))
        .sort((a, b) => a.path.localeCompare(b.path));

    return JSON.stringify({
        language: workspace.language ?? null,
        files,
    });
}

export function shouldSkipEmbeddedEnsureExercise(args: {
    existing: any;
    manifestLanguage: string;
    manifestStarterWorkspace: WorkspaceStateV2 | null | undefined;
    manifestStarterCode?: string | null | undefined;
    manifestIdeConfig?: LearningIdeConfig | null | undefined;
}) {
    const {
        existing,
        manifestLanguage,
        manifestStarterWorkspace,
        manifestStarterCode,
        manifestIdeConfig,
    } = args;
    if (!existing) return false;

    const existingWorkspace = getWorkspaceFromAnyState(existing);

    if (!stateLanguageMatches(existing, manifestLanguage, existingWorkspace)) {
        return false;
    }

    /**
     * The same starter files can be reused by consecutive project steps while
     * only the terminal contract changes. In that case the runtime exercise must
     * be re-ensured so terminalCwd/layoutMode/runnerBackend follow the current
     * manifest instead of staying on the previous step's cwd.
     */
    if (
        stableIdeConfigKeyForExerciseRenderer(existing?.ideConfig ?? null) !==
        stableIdeConfigKeyForExerciseRenderer(manifestIdeConfig ?? null)
    ) {
        return false;
    }

    const manifestHasStarter =
        workspaceHasAnyFile(manifestStarterWorkspace) ||
        isUsableStarterCode(manifestStarterCode);

    const existingHasContent =
        workspaceHasNonBlankFile(existingWorkspace) ||
        Boolean(String(existing?.code ?? "").trim()) ||
        Boolean(String(existing?.source ?? "").trim());

    /**
     * A previous broken i18n/starter pass could save an empty editor snapshot
     * as "saved". That is not real learner work. If the manifest now has a
     * real starter workspace/code, allow ensureExercise to replace the blank
     * saved shell with the authored starter.
     */
    if (isUserOwnedWorkspaceState(existing)) {
        return existingHasContent || !manifestHasStarter;
    }

    const manifestPaths = workspaceFilePaths(manifestStarterWorkspace);
    const existingPaths = workspaceFilePaths(existingWorkspace);
    const existingCoversManifestFiles =
        manifestPaths.size === 0 ||
        Array.from(manifestPaths).every((path) => existingPaths.has(path));

    if (!existingCoversManifestFiles) {
        return false;
    }

    if (existingHasContent) {
        return (
            workspaceContentKeyForExerciseRenderer(existingWorkspace) ===
            workspaceContentKeyForExerciseRenderer(manifestStarterWorkspace)
        );
    }

    return !manifestHasStarter;
}
function firstNonBlankCode(...values: Array<unknown>) {
    for (const value of values) {
        if (typeof value !== "string") continue;
        if (!value.trim()) continue;
        return value;
    }

    return "";
}

function workspaceWithEntryCode(
    workspace: WorkspaceStateV2 | null | undefined,
    code: string,
): WorkspaceStateV2 | null {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return workspace ?? null;
    }

    const entryId = workspace.entryFileId || workspace.activeFileId;
    const fallbackFile = workspace.nodes.find((node) => node.kind === "file");
    const targetId = workspace.nodes.some(
        (node) => node.kind === "file" && node.id === entryId,
    )
        ? entryId
        : fallbackFile?.id;

    if (!targetId) return workspace;

    let changed = false;

    const nodes = workspace.nodes.map((node) => {
        if (node.kind !== "file" || node.id !== targetId) return node;

        if (String(node.content ?? "") === code) return node;

        changed = true;

        return {
            ...node,
            content: code,
            updatedAt: Date.now(),
        };
    });

    return changed ? { ...workspace, nodes } : workspace;
}

export function hydrateBlankWorkspaceFromStarter(args: {
    workspace: WorkspaceStateV2 | null | undefined;
    fallbackCode: string;
    state: any;
}) {
    const { workspace, fallbackCode, state } = args;

    if (!workspace || workspace.version !== 2) return workspace ?? null;

    /**
     * If the learner intentionally cleared the editor, do not repopulate starter.
     */
    if (isUserOwnedWorkspaceState(state)) return workspace;

    const workspaceCode = deriveEntryCode(workspace) ?? "";

    if (workspaceCode.trim()) return workspace;
    if (!fallbackCode.trim()) return workspace;

    return workspaceWithEntryCode(workspace, fallbackCode);
}

function deriveCodeOrStarterFallback(args: {
    workspace: WorkspaceStateV2 | null | undefined;
    fallbackCode: string;
    state: any;
}) {
    const workspaceCode = deriveEntryCode(args.workspace);

    if (typeof workspaceCode === "string" && workspaceCode.trim()) {
        return workspaceCode;
    }

    /**
     * Preserve intentional user blank.
     */
    if (isUserOwnedWorkspaceState(args.state)) {
        return workspaceCode ?? "";
    }

    return args.fallbackCode;
}

export function resolveExerciseRuntimeDefaultsLayers(args: {
    exercise: CodeInputExerciseWithSqlExtras;
    subjectRuntimeDefaults?: unknown;
    courseRuntimeDefaults?: unknown;
    moduleRuntimeDefaults?: unknown;
    sectionRuntimeDefaults?: unknown;
    topicRuntimeDefaults?: unknown;
}) {
    return {
        subjectRuntimeDefaults:
            (args.exercise as any)?.subjectRuntimeDefaults ?? args.subjectRuntimeDefaults ?? null,
        courseRuntimeDefaults:
            (args.exercise as any)?.courseRuntimeDefaults ?? args.courseRuntimeDefaults ?? null,
        moduleRuntimeDefaults:
            (args.exercise as any)?.moduleRuntimeDefaults ?? args.moduleRuntimeDefaults ?? null,
        sectionRuntimeDefaults:
            (args.exercise as any)?.sectionRuntimeDefaults ?? args.sectionRuntimeDefaults ?? null,
        topicRuntimeDefaults:
            (args.exercise as any)?.topicRuntimeDefaults ?? args.topicRuntimeDefaults ?? null,
    };
}

function CodeInputWithTools(props: {
    exercise: CodeInputExerciseWithSqlExtras;
    current: any;
    lockInputs: boolean;
    checked: boolean;
    ok: boolean | null;
    feedbackDismissed: boolean;
    readOnly: boolean;
    resetCheckPatch: () => any;

    codeTools: CodeToolsApi;
    codeInputId: string;
    ownerCardId?: string | null;

    updateCurrent: (patch: any) => void;
    showPrompt: boolean;
    toolAutoOpen?: boolean;

    feedback?: any;
    topicId?: string;
    cardId?: string;
    subjectSlug?: string;
    moduleSlug?: string;
    sectionSlug?: string;
    exerciseStateId?: string;
    explanation?: string | null;
    subjectRuntimeDefaults?: unknown;
    courseRuntimeDefaults?: unknown;
    moduleRuntimeDefaults?: unknown;
    sectionRuntimeDefaults?: unknown;
    topicRuntimeDefaults?: unknown;
}) {
    const {
        exercise,
        current,
        lockInputs,
        checked,
        ok,
        feedbackDismissed,
        readOnly,
        resetCheckPatch,
        codeTools,
        codeInputId,
        ownerCardId,
        updateCurrent,
        showPrompt,
        toolAutoOpen = true,
        feedback,
        explanation,
        subjectSlug,
        moduleSlug,
        sectionSlug,
        topicId,
        cardId,
        exerciseStateId,
        subjectRuntimeDefaults,
        courseRuntimeDefaults,
        moduleRuntimeDefaults,
        sectionRuntimeDefaults,
        topicRuntimeDefaults,
    } = props;

    const {
        registerCodeInput,
        unregisterCodeInput,
        isBound,
        boundId,
        ensureVisible,
        requestBind,
        getRunFeedbackEntry,
        sketch,
    } = codeTools;

    const manifestLanguage = getManifestExerciseLanguage(exercise);
    const curLang = manifestLanguage;

    const curCode = (current as any).code ?? exercise.starterCode ?? "";
    const curStdin = (current as any).codeStdin ?? "";

    const stableExerciseId = getStableExerciseId({
        exerciseStateId,
        exercise,
        current,
    });

    const commonExerciseKey = getExerciseStateKey(
        {
            subjectSlug: subjectSlug || "",
            moduleSlug: moduleSlug || "",
            sectionSlug: sectionSlug,
            topicId: topicId || "",
            cardId: cardId || "",
        },
        stableExerciseId,
    );

    const exerciseKey = commonExerciseKey;

    const routeTargetEntry = useReviewRuntimeStore((s) => {
        const registry = s.targetRegistry;
        if (!registry) return null;

        return (
            registry.byKey[`exercise:${exerciseKey}`] ??
            registry.byKey[exerciseKey] ??
            Object.values(registry.byKey).find(
                (entry: any) =>
                    entry?.targetKind === "exercise" &&
                    entry?.exerciseStateKey === exerciseKey,
            ) ??
            null
        );
    });

    const exerciseManifest = mergeRenderedExerciseWithRouteManifest(
        exercise,
        (routeTargetEntry as any)?.item,
    ) as any;
    const currentWorkspaceRaw = getWorkspaceFromAnyState(current);
    const currentWorkspace = stateLanguageMatches(
        current,
        manifestLanguage,
        currentWorkspaceRaw,
    )
        ? currentWorkspaceRaw
        : null;
    const ensureExercise = useReviewRuntimeStore((s) => s.ensureExercise);
    const patchExercise = useReviewRuntimeStore((s) => s.patchExercise);
    const storeExercise = useReviewRuntimeStore((s) => s.exercises[exerciseKey]);

    const isSqlExercise =
        curLang === "sql" ||
        exercise?.language === "sql" ||
        hasNonBlankSqlSignal((exercise as any)?.fixedSqlDialect) ||
        hasNonBlankSqlSignal((exercise as any)?.runtime?.datasetId) ||
        hasNonBlankSqlSignal((exercise as any)?.sqlDatasetId) ||
        hasNonBlankSqlSignal(exercise?.sqlSchemaSql) ||
        hasNonBlankSqlSignal(exercise?.sqlSeedSql) ||
        hasNonBlankSqlSignal((exercise as any)?.sqlSetupSql);

    const exerciseSqlDialect = isSqlExercise ? exercise?.fixedSqlDialect : undefined;

    const exerciseSqlSchemaSql =
        isSqlExercise && typeof exercise?.sqlSchemaSql === "string"
            ? exercise.sqlSchemaSql
            : undefined;

    const exerciseSqlSeedSql =
        isSqlExercise && typeof exercise?.sqlSeedSql === "string"
            ? exercise.sqlSeedSql
            : undefined;

    const exerciseSqlInitialTableSnapshots =
        isSqlExercise &&
        exercise?.sqlInitialTableSnapshots &&
        typeof exercise.sqlInitialTableSnapshots === "object"
            ? exercise.sqlInitialTableSnapshots
            : undefined;

    const lastEmbeddedEnsureExerciseKeyRef = useRef<string | null>(null);

    useEffect(() => {
        if (exercise.kind !== "code_input") return;

        const exCode = exercise as CodeInputExerciseWithSqlExtras;

        const manifestLanguage = getManifestExerciseLanguage(exCode);

        // const manifestStarterWorkspace = resolveExerciseWorkspace({
        //     language: manifestLanguage,
        //     manifest: exerciseManifest,
        //     entry: routeTargetEntry,
        // });

        const ensureKey = [
            exerciseKey,
            subjectSlug || "",
            moduleSlug || "",
            sectionSlug || "",
            topicId || "",
            cardId || "",
            String((exercise as any).id ?? ""),
            String((exercise as any).exerciseKey ?? ""),
            String((exercise as any).language ?? ""),
            stableIdeConfigKeyForExerciseRenderer(resolveCodeInputIdeConfig(exCode)),
            workspaceHasNonBlankFile(manifestStarterWorkspace)
                ? "starter:nonblank"
                : "starter:blank",
        ].join("|");

        if (lastEmbeddedEnsureExerciseKeyRef.current === ensureKey) return;

        const existing = useReviewRuntimeStore.getState().exercises[exerciseKey];

        if (
            shouldSkipEmbeddedEnsureExercise({
                existing,
                manifestLanguage,
                manifestStarterWorkspace,
                manifestStarterCode: (exercise as any).starterCode,
                manifestIdeConfig: resolveCodeInputIdeConfig(exCode),
            })
        ) {
            lastEmbeddedEnsureExerciseKeyRef.current = ensureKey;
            return;
        }

        lastEmbeddedEnsureExerciseKeyRef.current = ensureKey;

        ensureExercise({
            exerciseKey,
            subjectSlug: subjectSlug || "",
            moduleSlug: moduleSlug || "",
            sectionSlug,
            topicId: topicId || "",
            cardId: cardId || "",
            manifest: exerciseManifest,
            entry: routeTargetEntry,
            saved: current,
        });

        // Intentionally do not depend on full `exercise` or `current`.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        exerciseKey,
        ensureExercise,
        subjectSlug,
        moduleSlug,
        sectionSlug,
        topicId,
        cardId,
        routeTargetEntry,
        exerciseManifest,
    ]);
    const onPatch = useCallback(
        (patch: any) => {
            patchExercise(exerciseKey, patch);
            updateCurrent(patch as any);
        },
        [patchExercise, exerciseKey, updateCurrent],
    );

    const compatibleStoreExercise = stateLanguageMatches(
        storeExercise,
        manifestLanguage,
        getWorkspaceFromAnyState(storeExercise),
    )
        ? storeExercise
        : null;
    const compatibleCurrentState = stateLanguageMatches(
        current,
        manifestLanguage,
        currentWorkspace,
    )
        ? current
        : null;
    const manifestStarterWorkspace = resolveExerciseWorkspace({
        language: manifestLanguage,
        manifest: exerciseManifest,
        entry: routeTargetEntry,
    });

    const manifestStarterCode = deriveEntryCode(manifestStarterWorkspace);

    const compatibleCurrentHasUserWork =
        isUserOwnedWorkspaceState(compatibleCurrentState) &&
        Boolean(
            String(deriveEntryCode(getWorkspaceFromAnyState(compatibleCurrentState)) ?? "").trim() ||
            String((compatibleCurrentState as any)?.code ?? "").trim(),
        );

    const activeState =
        compatibleStoreExercise ??
        (compatibleCurrentHasUserWork ? compatibleCurrentState : null) ??
        current;
    const fallbackCode = firstNonBlankCode(
        compatibleStoreExercise?.code,
        compatibleCurrentHasUserWork ? compatibleCurrentState?.code : "",
        manifestStarterCode,
        exercise.starterCode,
    );

    const resolvedTargetWorkspace = resolveWorkspaceForTarget({
        targetKey: exerciseKey,
        targetKind: "exercise",
        language: manifestLanguage,
        manifest: exerciseManifest,
        entry: routeTargetEntry,
        workspaceRequested: true,
        savedCandidates: [
            compatibleStoreExercise
                ? {
                    targetKey: exerciseKey,
                    workspace:
                        compatibleStoreExercise.workspace ??
                        compatibleStoreExercise.codeWorkspace ??
                        compatibleStoreExercise.ideWorkspace ??
                        null,
                    code: compatibleStoreExercise.code ?? null,
                    stdin: compatibleStoreExercise.stdin ?? compatibleStoreExercise.codeStdin ?? null,
                    language: manifestLanguage,
                    userEdited: compatibleStoreExercise.userEdited,
                    workspaceOrigin: compatibleStoreExercise.workspaceOrigin,
                    starterHash: compatibleStoreExercise.starterHash,
                    updatedAt: compatibleStoreExercise.updatedAt,
                  }
                : null,
            compatibleCurrentState
                ? {
                    targetKey: exerciseKey,
                    workspace: currentWorkspace,
                    code: compatibleCurrentState.code ?? null,
                    stdin: compatibleCurrentState.codeStdin ?? null,
                    language: manifestLanguage,
                    userEdited: compatibleCurrentState.userEdited,
                    workspaceOrigin: compatibleCurrentState.workspaceOrigin,
                    starterHash: compatibleCurrentState.starterHash,
                    updatedAt: compatibleCurrentState.updatedAt,
                  }
                : null,
        ].filter(Boolean) as any,
    });

    const activeWorkspace = mergeMissingStarterWorkspaceFiles(
        resolvedTargetWorkspace.workspace ?? currentWorkspace,
        manifestStarterWorkspace,
    );
    const activeCode =
        resolvedTargetWorkspace.source === "saved"
            ? deriveEntryCode(activeWorkspace) ?? resolvedTargetWorkspace.code
            : deriveCodeOrStarterFallback({
                workspace: activeWorkspace,
                fallbackCode: resolvedTargetWorkspace.code || fallbackCode,
                state: activeState,
            });
    const activeStdin =
        activeWorkspace?.stdin ??
        compatibleStoreExercise?.stdin ??
        compatibleCurrentState?.codeStdin ??
        "";
    const activeLanguage = manifestLanguage;
    const activeSketch = compatibleStoreExercise?.sketch || null;
    const runtimeLayers = resolveExerciseRuntimeDefaultsLayers({
        exercise,
        subjectRuntimeDefaults,
        courseRuntimeDefaults,
        moduleRuntimeDefaults,
        sectionRuntimeDefaults,
        topicRuntimeDefaults,
    });

    const resolvedExerciseSql = resolveSqlRunnerConfig({
        language: manifestLanguage,
        sqlDialect:
            activeLanguage === "sql"
                ? ((compatibleStoreExercise as any)?.sqlDialect ?? exerciseSqlDialect)
                : undefined,
        sqlSchemaSql:
            activeLanguage === "sql"
                ? firstNonBlank((compatibleStoreExercise as any)?.sqlSchemaSql, exerciseSqlSchemaSql)
                : undefined,
        sqlSeedSql:
            activeLanguage === "sql"
                ? firstNonBlank((compatibleStoreExercise as any)?.sqlSeedSql, exerciseSqlSeedSql)
                : undefined,
        sqlInitialTableSnapshots:
            activeLanguage === "sql"
                ? ((compatibleStoreExercise as any)?.sqlInitialTableSnapshots ??
                    exerciseSqlInitialTableSnapshots)
                : undefined,
        exerciseRuntime: (exercise as any)?.runtime,
        exerciseSqlDatasetId: (exercise as any)?.sqlDatasetId,
        recipe: (exercise as any)?.recipe,
        subjectRuntimeDefaults: runtimeLayers.subjectRuntimeDefaults,
        courseRuntimeDefaults: runtimeLayers.courseRuntimeDefaults,
        moduleRuntimeDefaults: runtimeLayers.moduleRuntimeDefaults,
        sectionRuntimeDefaults: runtimeLayers.sectionRuntimeDefaults,
        topicRuntimeDefaults: runtimeLayers.topicRuntimeDefaults,
    });

    const normalizedActive = normalizeCodeWorkspacePair({
        workspace: activeWorkspace,
        code: activeCode,
        state: activeState,
        language: activeLanguage,
        stdin: activeStdin,
    });


    const registerArgs = useMemo(
        () => {
            const activeStateIsLearnerOwned =
                isUserOwnedWorkspaceState(activeState) ||
                resolvedTargetWorkspace.source === "saved" ||
                resolvedTargetWorkspace.source === "draft";

            return {
            exerciseKey,
            lang: activeLanguage,
            code: normalizedActive.code,
            workspace: normalizedActive.workspace,
            stdin: activeStdin,
            ideConfig: resolveCodeInputIdeConfig(exercise),
            ownerCardId,
            /**
             * The current rendered exercise contract is authoritative for this
             * registration. bindCodeInput may still preserve compatible learner
             * workspace when activeState is user/saved, but it must not let a stale
             * generic tool snapshot (for example Python main.py) beat the live
             * dynamic practice item starter.
             */
            preferSnapshot: !activeStateIsLearnerOwned,
            userEdited: activeStateIsLearnerOwned,
            workspaceOrigin: activeStateIsLearnerOwned
                ? ((activeState as any)?.workspaceOrigin ?? "saved")
                : "starter",
            sqlDialect: activeLanguage === "sql" ? resolvedExerciseSql.sqlDialect : undefined,
            sqlDatasetId: activeLanguage === "sql" ? resolvedExerciseSql.sqlDatasetId : undefined,
            sqlSchemaSql: activeLanguage === "sql" ? resolvedExerciseSql.sqlSchemaSql : undefined,
            sqlSeedSql: activeLanguage === "sql" ? resolvedExerciseSql.sqlSeedSql : undefined,
            sqlInitialTableSnapshots:
                activeLanguage === "sql" ? resolvedExerciseSql.sqlInitialTableSnapshots : undefined,
            sqlPaneOptions: activeLanguage === "sql" ? resolvedExerciseSql.sqlPaneOptions : undefined,
            onPatch,
        };
        },
        [
            exerciseKey,
            activeLanguage,
            activeStdin,
            exercise,
            normalizedActive.code,
            normalizedActive.workspace,
            ownerCardId,
            activeState,
            exerciseSqlDialect,
            exerciseSqlSchemaSql,
            exerciseSqlSeedSql,
            exerciseSqlInitialTableSnapshots,
            onPatch,
            resolvedExerciseSql,
        ],
    );

    const unregisterRef = useRef(unregisterCodeInput);

    useEffect(() => {
        unregisterRef.current = unregisterCodeInput;
    }, [unregisterCodeInput]);

    useEffect(() => {
        registerCodeInput(codeInputId, registerArgs);
        return () => unregisterRef.current(codeInputId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [codeInputId]);

    const lastAutoBindKeyRef = useRef<string | null>(null);

    useEffect(() => {
        registerCodeInput(codeInputId, registerArgs);
    }, [registerCodeInput, codeInputId, registerArgs, boundId]);

    /**
     * Critical:
     * In tools mode, the Tools editor must follow the currently rendered
     * exercise. Auto-binding must not force responsive Lesson/Code tabs to the
     * Code tab; otherwise terminal/project E2E and real learners lose the
     * visible Check button after the editor binds. User-initiated Open Code
     * still calls ensureVisible below.
     */
    useEffect(() => {
        if (!toolAutoOpen) return;

        const autoBindKey = `${codeInputId}::${exerciseKey}`;
        if (lastAutoBindKeyRef.current === autoBindKey) return;

        lastAutoBindKeyRef.current = autoBindKey;

        queueMicrotask(() => {
            requestBind(codeInputId);
        });

        // Intentionally depend only on the active exercise identity.
        // ensureVisible/requestBind/isBound can change as a result of binding
        // and must not retrigger this effect.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [toolAutoOpen, codeInputId, exerciseKey]);

    const toolsBoundToThis = isBound(codeInputId);
    const toolsUnbound = boundId == null;
    const runEntry = getRunFeedbackEntry?.(codeInputId) ?? null;
    const toolRunFeedback = runEntry?.feedback ?? null;
    const toolRunTick = runEntry?.tick ?? 0;
    const savedSketch = storeExercise?.sketch || null;

    return (
        <>
            {process.env.NODE_ENV !== "production" ? (
                <textarea
                    data-testid="exercise-renderer-state-e2e-input"
                    aria-label="E2E resolved exercise state"
                    readOnly
                    value={JSON.stringify({
                        exerciseId: String((exercise as any)?.id ?? ""),
                        exerciseKey,
                        code: normalizedActive.code ?? "",
                        language: activeLanguage,
                        ideConfig: resolveCodeInputIdeConfig(exercise),
                        starterCode: (exercise as any)?.starterCode ?? "",
                        starterFiles: (exercise as any)?.starterFiles ?? null,
                        workspace: (exercise as any)?.workspace ?? null,
                        recipe: (exercise as any)?.recipe ?? null,
                    })}
                    style={{
                        position: "absolute",
                        width: 1,
                        height: 1,
                        opacity: 0,
                        pointerEvents: "none",
                    }}
                />
            ) : null}

            <CodeInputExerciseUI
                exercise={exercise}
            code={normalizedActive.code}
            stdin={activeStdin}
            exerciseKey={exerciseKey}
            subjectSlug={subjectSlug}
            moduleSlug={moduleSlug}
            sectionSlug={sectionSlug}
            topicId={topicId}
            cardId={cardId}
            workspace={normalizedActive.workspace}
            language={activeLanguage}
            sketch={activeSketch}
            savedSketch={savedSketch}
            onChangeCode={(code) =>
                onPatch({
                    code,
                    source: code,
                    userEdited: true,
                    workspaceOrigin: "user",
                    updatedAt: Date.now(),
                    ...resetCheckPatch(),
                })
            }
            onChangeStdin={(stdin) =>
                onPatch({
                    stdin,
                    codeStdin: stdin,
                    userEdited: true,
                    workspaceOrigin: "user",
                    updatedAt: Date.now(),
                    ...resetCheckPatch(),
                })
            }
            onChangeLanguage={(language) =>
                onPatch({
                    language,
                    codeLang: language,
                    lang: language,
                    userEdited: true,
                    workspaceOrigin: "user",
                    updatedAt: Date.now(),
                    ...resetCheckPatch(),
                })
            }
            onChangeWorkspace={(workspace) => {
                onPatch({
                    ...codeWorkspacePatch(workspace, activeLanguage),
                    ...resetCheckPatch(),
                });
            }}
            disabled={lockInputs}
            checked={checked}
            ok={ok}
            readOnly={readOnly}
            variant="tools"
            toolsBound={toolsBoundToThis}
            toolsUnbound={toolsUnbound}
            autoBindMode="never"
            showPrompt={showPrompt}
            feedback={feedback ?? null}
            explanation={explanation ?? null}
            feedbackDismissed={feedbackDismissed}
            runFeedback={toolRunFeedback}
            runFeedbackTick={toolRunTick}
            subjectRuntimeDefaults={runtimeLayers.subjectRuntimeDefaults}
            courseRuntimeDefaults={runtimeLayers.courseRuntimeDefaults}
            moduleRuntimeDefaults={runtimeLayers.moduleRuntimeDefaults}
            sectionRuntimeDefaults={runtimeLayers.sectionRuntimeDefaults}
            topicRuntimeDefaults={runtimeLayers.topicRuntimeDefaults}
            onUseTools={() => {
                ensureVisible?.();
                requestBind(codeInputId);
            }}
            onSketchStateChange={(state) => sketch?.saveSketchDebounced?.(exerciseKey, state, true)}
            />
        </>
    );
}

export default function ExerciseRenderer({
                                             exercise,
                                             current,
                                             busy,
                                             isAssignmentRun,
                                             maxAttempts,
                                             padRef,
                                             updateCurrent,
                                             readOnly = false,
                                             reviewCorrectItem = null,
                                             codeRunnerMode = "embedded",
                                             codeTools = null,
                                             codeInputId,
                                             codeOwnerCardId,
                                             codeToolsAutoOpen = true,
                                             showPrompt = true,

                                             subjectSlug,
                                             moduleSlug,
                                             sectionSlug,
                                             topicId,
                                             cardId,
                                             exerciseStateId,
                                             subjectRuntimeDefaults,
                                             courseRuntimeDefaults,
                                             moduleRuntimeDefaults,
                                             sectionRuntimeDefaults,
                                             topicRuntimeDefaults,
                                         }: {
    exercise: Exercise;
    current: QItem;
    busy: boolean;
    isAssignmentRun: boolean;
    maxAttempts: number | null;
    padRef: React.MutableRefObject<VectorPadState>;
    updateCurrent: (patch: Partial<QItem>) => void;
    readOnly?: boolean;

    reviewCorrectItem?: QItem | null;

    codeRunnerMode?: "embedded" | "tools";
    codeTools?: CodeToolsApi | null;
    codeInputId?: string;
    codeOwnerCardId?: string | null;
    codeToolsAutoOpen?: boolean;
    showPrompt?: boolean;

    subjectSlug?: string;
    moduleSlug?: string;
    sectionSlug?: string;
    topicId?: string;
    cardId?: string;
    exerciseStateId?: string;
    subjectRuntimeDefaults?: unknown;
    courseRuntimeDefaults?: unknown;
    moduleRuntimeDefaults?: unknown;
    sectionRuntimeDefaults?: unknown;
    topicRuntimeDefaults?: unknown;
}) {
    const {raw} = useTaggedT();

    const ex = useMemo(() => {
        return resolveDeepTagged(exercise, (key) => raw(key, "")) as Exercise;
    }, [exercise, raw]);

    const ensureExercise = useReviewRuntimeStore((s) => s.ensureExercise);

    const stableExerciseId = useMemo(() => {
        return getStableExerciseId({
            exerciseStateId,
            exercise: ex as any,
            current,
        });
    }, [exerciseStateId, ex, current]);

    const exerciseKey = useMemo(() => {
        return getExerciseStateKey(
            {subjectSlug, moduleSlug, sectionSlug, topicId, cardId},
            stableExerciseId,
        );
    }, [subjectSlug, moduleSlug, sectionSlug, topicId, cardId, stableExerciseId]);

    const storeExercise = useReviewRuntimeStore((s) => s.exercises[exerciseKey]);
    const patchExercise = useReviewRuntimeStore((s) => s.patchExercise);
    const lastEmbeddedEnsureExerciseKeyRef = useRef<string | null>(null);
    useEffect(() => {
        if (ex.kind !== "code_input") return;

        const exCode = ex as CodeInputExerciseWithSqlExtras;

        const manifestLanguage = getManifestExerciseLanguage(exCode);

        const manifestStarterWorkspace = resolveExerciseWorkspace({
            language: manifestLanguage,
            manifest: exCode,
        });

        const ensureKey = [
            exerciseKey,
            subjectSlug || "",
            moduleSlug || "",
            sectionSlug || "",
            topicId || "",
            cardId || "",
            String((ex as any).id ?? ""),
            String((ex as any).exerciseKey ?? ""),
            String((ex as any).language ?? ""),
            stableIdeConfigKeyForExerciseRenderer(resolveCodeInputIdeConfig(exCode)),
            workspaceHasNonBlankFile(manifestStarterWorkspace)
                ? "starter:nonblank"
                : "starter:blank",
        ].join("|");

        if (lastEmbeddedEnsureExerciseKeyRef.current === ensureKey) return;

        const existing = useReviewRuntimeStore.getState().exercises[exerciseKey];

        if (
            shouldSkipEmbeddedEnsureExercise({
                existing,
                manifestLanguage,
                manifestStarterWorkspace,
                manifestStarterCode: (ex as any).starterCode,
                manifestIdeConfig: resolveCodeInputIdeConfig(exCode),
            })
        ) {
            lastEmbeddedEnsureExerciseKeyRef.current = ensureKey;
            return;
        }

        lastEmbeddedEnsureExerciseKeyRef.current = ensureKey;

        ensureExercise({
            exerciseKey,
            subjectSlug: subjectSlug || "",
            moduleSlug: moduleSlug || "",
            sectionSlug,
            topicId: topicId || "",
            cardId: cardId || "",
            manifest: ex,
            saved: current,
        });

        // Intentionally do not depend on full `ex` or `current`.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        exerciseKey,
        ensureExercise,
        subjectSlug,
        moduleSlug,
        sectionSlug,
        topicId,
        cardId,
    ]);
    const onPatch = useCallback(
        (patch: any) => {
            patchExercise(exerciseKey, patch);
            updateCurrent(patch as any);
        },
        [patchExercise, exerciseKey, updateCurrent],
    );

    const maxA =
        maxAttempts == null || !Number.isFinite(maxAttempts)
            ? Number.POSITIVE_INFINITY
            : Math.max(1, Math.floor(maxAttempts));

    const attempts = (current as any).attempts ?? 0;
    const hasAnyResult = Boolean((current as any).submitted || (current as any).result);

    const isRevealResult = Boolean(
        (current as any)?.result?.revealUsed ||
        (current as any)?.result?.revealAnswer,
    );

    const exRef = useRef(ex);
    exRef.current = ex;

    const resultOk =
        !isRevealResult && typeof (current as any).result?.ok === "boolean"
            ? (current as any).result.ok
            : null;

    const feedbackDismissed = Boolean((current as any).feedbackDismissed);

    const ok: boolean | null =
        feedbackDismissed && resultOk === false
            ? null
            : resultOk;

    const checked = Boolean(
        !feedbackDismissed &&
        ((current as any).submitted || ok !== null)
    );

    const finalized = Boolean((current as any)?.result?.finalized);
    const outOfAttempts =
        finalized || (maxA !== Number.POSITIVE_INFINITY && attempts >= maxA && ok !== true);

    const lockInputs = readOnly || busy || ok === true || outOfAttempts;
    const lastRuntimeWorkspaceSyncKeyRef = useRef<string | null>(null);

    function resetCheckPatch() {
        if (readOnly) return {};

        /**
         * Do not remove result here.
         *
         * item.result stores the latest checked result.
         * item.feedbackDismissed controls whether wrong feedback is visible.
         *
         * Only real learner edits should call this function.
         */
        return hasAnyResult
            ? {
                submitted: false,
                feedbackDismissed: true,
                dismissFeedbackOnEdit: true,
                updateOrigin: "user",
                userEdited: true,
                workspaceOrigin: "user",
            }
            : {};
    }

    useEffect(() => {
        if (ex.kind !== "code_input") return;

        const store = useReviewRuntimeStore.getState().exercises[exerciseKey];
        const manifestLanguage = getManifestExerciseLanguage(ex as CodeInputExerciseWithSqlExtras);

        const workspace =
            store?.workspace ??
            ((current as any).workspace?.version === 2
                ? (current as any).workspace
                : (current as any).codeWorkspace?.version === 2
                    ? (current as any).codeWorkspace
                    : (current as any).ideWorkspace?.version === 2
                        ? (current as any).ideWorkspace
                        : null);

        if (!workspace || workspace.version !== 2) return;
        if (!stateLanguageMatches(store, manifestLanguage, workspace)) return;

        const workspaceCode = deriveEntryCode(workspace) ?? "";
        const workspaceStdin = workspace.stdin ?? "";

        const currentCode = (current as any).code;
        const currentStdin = (current as any).codeStdin;
        const currentWorkspace = (current as any).workspace;
        const currentWorkspaceKey = workspaceContentKeyForExerciseRenderer(
            currentWorkspace?.version === 2 ? currentWorkspace : null,
        );
        const nextWorkspaceKey = workspaceContentKeyForExerciseRenderer(workspace);

        const needsSync =
            currentCode !== workspaceCode ||
            currentStdin !== workspaceStdin ||
            currentWorkspaceKey !== nextWorkspaceKey;

        const runtimeSyncKey = JSON.stringify({
            exerciseKey,
            workspaceKey: nextWorkspaceKey,
            code: workspaceCode,
            stdin: workspaceStdin,
            userEdited: store?.userEdited === true,
            workspaceOrigin: store?.workspaceOrigin ?? "saved",
            starterHash: store?.starterHash ?? null,
            updatedAt: store?.updatedAt ?? null,
        });

        if (!needsSync) {
            if (lastRuntimeWorkspaceSyncKeyRef.current === runtimeSyncKey) {
                lastRuntimeWorkspaceSyncKeyRef.current = null;
            }
            return;
        }

        if (lastRuntimeWorkspaceSyncKeyRef.current === runtimeSyncKey) return;
        lastRuntimeWorkspaceSyncKeyRef.current = runtimeSyncKey;

        updateCurrent({
            workspace,
            codeWorkspace: workspace,
            ideWorkspace: workspace,
            code: workspaceCode,
            source: workspaceCode,
            stdin: workspaceStdin,
            codeStdin: workspaceStdin,
            userEdited: store?.userEdited === true || store?.workspaceOrigin === "user" || store?.workspaceOrigin === "saved",
            workspaceOrigin: store?.workspaceOrigin ?? "saved",
            starterHash: store?.starterHash,
            updatedAt: store?.updatedAt,
        } as any);
    }, [ex.kind, exerciseKey, current, updateCurrent]);

    if (ex.kind === "numeric") {
        return (
            <NumericExerciseUI
                exercise={ex}
                value={current.num}
                onChange={(num) => updateCurrent({num, ...resetCheckPatch()})}
                disabled={lockInputs}
                checked={checked}
                ok={ok}
            />
        );
    }

    if (ex.kind === "single_choice") {
        const reviewCorrectId =
            reviewCorrectItem && typeof (reviewCorrectItem as any).single === "string"
                ? String((reviewCorrectItem as any).single)
                : null;

        return (
            <SingleChoiceExerciseUI
                exercise={ex}
                value={current.single}
                onChange={(id) => updateCurrent({single: id, ...resetCheckPatch()})}
                disabled={lockInputs}
                checked={checked}
                ok={ok}
                reviewCorrectId={reviewCorrectId}
            />
        );
    }

    if (ex.kind === "multi_choice") {
        const reviewCorrectIds =
            reviewCorrectItem && Array.isArray((reviewCorrectItem as any).multi)
                ? (reviewCorrectItem as any).multi.map((x: any) => String(x))
                : null;

        return (
            <MultiChoiceExerciseUI
                exercise={ex}
                value={current.multi}
                onChange={(ids) => updateCurrent({multi: ids, ...resetCheckPatch()})}
                disabled={lockInputs}
                checked={checked}
                ok={ok}
                reviewCorrectIds={reviewCorrectIds}
            />
        );
    }

    if (ex.kind === "text_input") {
        const reviewCorrectText =
            reviewCorrectItem && typeof (reviewCorrectItem as any).text === "string"
                ? String((reviewCorrectItem as any).text)
                : null;

        return (
            <TextInputExerciseUI
                exercise={ex as any}
                value={(current as any).text ?? ""}
                onChange={(text) => updateCurrent({text, ...resetCheckPatch()})}
                disabled={lockInputs}
                checked={checked}
                ok={ok}
                reviewCorrectText={reviewCorrectText}
            />
        );
    }

    if (ex.kind === "drag_reorder") {
        const curOrder = Array.isArray((current as any).reorder)
            ? (current as any).reorder.map(String)
            : Array.isArray((current as any).reorderIds)
                ? (current as any).reorderIds.map(String)
                : [];

        const reviewCorrectTokenIds =
            reviewCorrectItem && Array.isArray((reviewCorrectItem as any).reorder)
                ? (reviewCorrectItem as any).reorder.map((x: any) => String(x))
                : reviewCorrectItem && Array.isArray((reviewCorrectItem as any).reorderIds)
                    ? (reviewCorrectItem as any).reorderIds.map((x: any) => String(x))
                    : null;

        return (
            <DragReorderExerciseUI
                exercise={ex as any}
                tokenIds={curOrder}
                onChange={(ids) =>
                    updateCurrent({
                        reorder: ids,
                        ui: {
                            ...(current.ui ?? {}),
                            reorderTouched: true,
                        },
                        ...resetCheckPatch(),
                    })
                }
                disabled={lockInputs}
                checked={checked}
                ok={ok}
                reviewCorrectTokenIds={reviewCorrectTokenIds}
            />
        );
    }

    if (ex.kind === "voice_input") {
        const reviewCorrectTranscript =
            reviewCorrectItem && typeof (reviewCorrectItem as any).voiceTranscript === "string"
                ? String((reviewCorrectItem as any).voiceTranscript)
                : null;

        return (
            <VoiceInputExerciseUI
                exercise={ex as any}
                transcript={(current as any).voiceTranscript ?? ""}
                onChangeTranscript={(voiceTranscript) =>
                    updateCurrent({voiceTranscript, ...resetCheckPatch()})
                }
                disabled={lockInputs}
                checked={checked}
                ok={ok}
                reviewCorrectTranscript={reviewCorrectTranscript}
            />
        );
    }

    if (ex.kind === "matrix_input") {
        const exAny = ex as any;
        const allowResize = true;
        const panelReadOnly = lockInputs;

        return (
            <MatrixInputPanel
                labelLatex={exAny.labelLatex ?? String.raw`\mathbf{A}=`}
                rows={current.matRows}
                cols={current.matCols}
                allowResize={allowResize}
                value={current.mat}
                readOnly={panelReadOnly}
                requiredRows={exAny.rows}
                requiredCols={exAny.cols}
                onShapeChange={(r, c) => {
                    updateCurrent({
                        matRows: r,
                        matCols: c,
                        mat: resizeGrid(current.mat, r, c),
                        ...(hasAnyResult
                            ? {
                                submitted: false,
                                feedbackDismissed: true,
                                dismissFeedbackOnEdit: true,
                                updateOrigin: "user",
                            }
                            : {}),
                    });
                }}
                onChange={(next) =>
                    updateCurrent({
                        mat: next,
                        ...(hasAnyResult
                            ? {
                                submitted: false,
                                feedbackDismissed: true,
                                dismissFeedbackOnEdit: true,
                                updateOrigin: "user",
                            }
                            : {}),
                    })
                }
            />
        );
    }

    if (ex.kind === "vector_drag_target") {
        return (
            <VectorDragTargetExerciseUI
                key={(ex as any).id ?? (exercise as any).key ?? current.key}
                exercise={ex}
                a={current.dragA}
                b={current.dragB}
                onChange={(a, b) => updateCurrent({dragA: a, dragB: b, ...resetCheckPatch()})}
                padRef={padRef}
                disabled={lockInputs}
            />
        );
    }

    if (ex.kind === "listen_build") {
        return (
            <ListenBuildExerciseUI
                exercise={ex as any}
                value={(current as any).text ?? ""}
                onChangeValue={(text) => updateCurrent({text, ...resetCheckPatch()})}
                disabled={lockInputs}
                checked={checked}
                showTargetWhen="never"
                ok={ok}
            />
        );
    }

    if (ex.kind === "fill_blank_choice") {
        const reviewCorrectValue =
            reviewCorrectItem && typeof (reviewCorrectItem as any).text === "string"
                ? String((reviewCorrectItem as any).text)
                : typeof (exercise as any).correct === "string"
                    ? String((exercise as any).correct)
                    : null;

        return (
            <FillBlankChoiceExerciseUI
                exercise={ex as any}
                value={(current as any).text ?? ""}
                onChangeValue={(text) => updateCurrent({text, single: text, ...resetCheckPatch()})}
                disabled={lockInputs}
                checked={checked}
                ok={ok}
                reviewCorrectValue={reviewCorrectValue}
            />
        );
    }

    if (ex.kind === "vector_drag_dot") {
        return (
            <VectorDragDotExerciseUI
                exercise={ex}
                a={current.dragA}
                onChange={(a) => updateCurrent({dragA: a, ...resetCheckPatch()})}
                padRef={padRef}
                disabled={lockInputs}
            />
        );
    }

    const resultAny = (current as any)?.result ?? null;
    const codeFeedback = resultAny?.feedback ?? null;
    const codeExplanation =
        typeof resultAny?.explanation === "string" ? resultAny.explanation : null;

    if (ex.kind === "code_input") {
        const useTools = codeRunnerMode === "tools" && !!codeTools && !!codeInputId;

        if (useTools) {
            return (
            <CodeInputWithTools
                    exercise={ex}
                    current={current}
                    lockInputs={lockInputs}
                    checked={checked}
                    ok={ok}
                    feedbackDismissed={feedbackDismissed}
                    readOnly={readOnly}
                    resetCheckPatch={resetCheckPatch}
                    codeTools={codeTools!}
                    codeInputId={codeInputId!}
                    ownerCardId={codeOwnerCardId}
                    updateCurrent={updateCurrent}
                    showPrompt={showPrompt}
                    toolAutoOpen={codeToolsAutoOpen}
                    feedback={codeFeedback}
                    explanation={codeExplanation}
                    subjectSlug={subjectSlug}
                    moduleSlug={moduleSlug}
                    sectionSlug={sectionSlug}
                    topicId={topicId}
                    cardId={cardId}
                    exerciseStateId={stableExerciseId}
                    subjectRuntimeDefaults={subjectRuntimeDefaults}
                    courseRuntimeDefaults={courseRuntimeDefaults}
                    moduleRuntimeDefaults={moduleRuntimeDefaults}
                    sectionRuntimeDefaults={sectionRuntimeDefaults}
                    topicRuntimeDefaults={topicRuntimeDefaults}
                />
            );
        }

        const exCode = ex as CodeInputExerciseWithSqlExtras;
        const manifestLanguage = getManifestExerciseLanguage(exCode);
        const compatibleStoreExercise = stateLanguageMatches(
            storeExercise,
            manifestLanguage,
            getWorkspaceFromAnyState(storeExercise),
        )
            ? storeExercise
            : null;
        const compatibleCurrentState = stateLanguageMatches(
            current,
            manifestLanguage,
            getWorkspaceFromAnyState(current),
        )
            ? current
            : null;

        const activeState = compatibleStoreExercise ?? compatibleCurrentState ?? current;

        const fallbackCode = firstNonBlankCode(
            compatibleStoreExercise?.code,
            compatibleCurrentState?.code,
            (exCode as any).starterCode,
        );
        const resolvedWorkspace = resolveWorkspaceForExerciseTarget({
            targetKey: exerciseKey,
            language: manifestLanguage,
            manifest: exCode,
            savedCandidates: [
                compatibleStoreExercise
                    ? {
                        targetKey: exerciseKey,
                        workspace:
                            compatibleStoreExercise.workspace ??
                            compatibleStoreExercise.codeWorkspace ??
                            compatibleStoreExercise.ideWorkspace ??
                            null,
                        code: compatibleStoreExercise.code ?? null,
                        stdin: compatibleStoreExercise.stdin ?? compatibleStoreExercise.codeStdin ?? null,
                        language: manifestLanguage,
                        userEdited: compatibleStoreExercise.userEdited,
                        workspaceOrigin: compatibleStoreExercise.workspaceOrigin,
                        starterHash: compatibleStoreExercise.starterHash,
                        updatedAt: compatibleStoreExercise.updatedAt,
                    }
                    : null,
                compatibleCurrentState
                    ? {
                        targetKey: exerciseKey,
                        workspace: getWorkspaceFromAnyState(compatibleCurrentState),
                        code: (compatibleCurrentState as any).code ?? null,
                        stdin:
                            (compatibleCurrentState as any).codeStdin ??
                            (compatibleCurrentState as any).stdin ??
                            null,
                        language: manifestLanguage,
                        userEdited: (compatibleCurrentState as any).userEdited,
                        workspaceOrigin: (compatibleCurrentState as any).workspaceOrigin,
                        starterHash: (compatibleCurrentState as any).starterHash,
                        updatedAt: (compatibleCurrentState as any).updatedAt,
                    }
                    : null,
            ].filter(Boolean) as any,
        });

        const activeWorkspace = resolvedWorkspace.workspace;
        const activeCode =
            resolvedWorkspace.source === "saved"
                ? deriveEntryCode(activeWorkspace) ?? ""
                : deriveCodeOrStarterFallback({
                    workspace: activeWorkspace,
                    fallbackCode,
                    state: activeState,
                });

        const activeStdin =
            activeWorkspace?.stdin ??
            compatibleStoreExercise?.stdin ??
            compatibleCurrentState?.codeStdin ??
            "";
        const activeLanguage = manifestLanguage;
        const runtimeLayers = resolveExerciseRuntimeDefaultsLayers({
            exercise: exCode,
            subjectRuntimeDefaults,
            courseRuntimeDefaults,
            moduleRuntimeDefaults,
            sectionRuntimeDefaults,
            topicRuntimeDefaults,
        });
        const resolvedEmbeddedSql = resolveSqlRunnerConfig({
            language: activeLanguage,
            sqlDialect: (compatibleStoreExercise as any)?.sqlDialect ?? exCode.fixedSqlDialect,
            sqlSchemaSql: firstNonBlank(
                (compatibleStoreExercise as any)?.sqlSchemaSql,
                (exCode as any)?.sqlSchemaSql,
            ),
            sqlSeedSql: firstNonBlank(
                (compatibleStoreExercise as any)?.sqlSeedSql,
                (exCode as any)?.sqlSeedSql,
            ),
            sqlInitialTableSnapshots:
                (compatibleStoreExercise as any)?.sqlInitialTableSnapshots ??
                (exCode as any)?.sqlInitialTableSnapshots,
            exerciseRuntime: (exCode as any)?.runtime,
            exerciseSqlDatasetId: (exCode as any)?.sqlDatasetId,
            recipe: (exCode as any)?.recipe,
            subjectRuntimeDefaults: runtimeLayers.subjectRuntimeDefaults,
            courseRuntimeDefaults: runtimeLayers.courseRuntimeDefaults,
            moduleRuntimeDefaults: runtimeLayers.moduleRuntimeDefaults,
            sectionRuntimeDefaults: runtimeLayers.sectionRuntimeDefaults,
            topicRuntimeDefaults: runtimeLayers.topicRuntimeDefaults,
        });

        return (
            <>
                {process.env.NODE_ENV !== "production" ? (
                    <textarea
                        data-testid="exercise-renderer-state-e2e-input"
                        aria-label="E2E resolved embedded exercise state"
                        readOnly
                        value={JSON.stringify({
                            exerciseId: String((exCode as any)?.id ?? ""),
                            exerciseKey,
                            code: activeCode ?? "",
                            language: activeLanguage,
                            ideConfig: resolveCodeInputIdeConfig(exCode),
                            starterCode: (exCode as any)?.starterCode ?? "",
                            starterFiles: (exCode as any)?.starterFiles ?? null,
                            workspace: (exCode as any)?.workspace ?? null,
                            recipe: (exCode as any)?.recipe ?? null,
                        })}
                        style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
                    />
                ) : null}
                <textarea
                    data-testid="exercise-renderer-embedded-state-e2e-input"
                    aria-label="E2E resolved embedded exercise state marker"
                    readOnly
                    value="1"
                    style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
                />
                <CodeInputExerciseUI
                    exercise={exCode}
                code={activeCode}
                stdin={activeStdin}
                workspace={activeWorkspace}
                exerciseKey={exerciseKey}
                subjectSlug={subjectSlug}
                moduleSlug={moduleSlug}
                sectionSlug={sectionSlug}
                topicId={topicId}
                cardId={cardId}
                frame="card"
                language={activeLanguage}
                onChangeCode={(code) =>
                    onPatch({
                        code,
                        source: code,
                        userEdited: true,
                        workspaceOrigin: "user",
                        updatedAt: Date.now(),
                        ...resetCheckPatch(),
                    })
                }
                onChangeStdin={(codeStdin) =>
                    onPatch({
                        stdin: codeStdin,
                        codeStdin,
                        userEdited: true,
                        workspaceOrigin: "user",
                        updatedAt: Date.now(),
                        ...resetCheckPatch(),
                    })
                }
                onChangeLanguage={(codeLang) =>
                    onPatch({
                        language: codeLang,
                        codeLang,
                        lang: codeLang,
                        userEdited: true,
                        workspaceOrigin: "user",
                        updatedAt: Date.now(),
                        ...resetCheckPatch(),
                    })
                }
                onChangeWorkspace={(workspace) => {
                    onPatch({
                        ...codeWorkspacePatch(workspace, activeLanguage),
                        ...resetCheckPatch(),
                    });
                }}
                disabled={lockInputs}
                checked={checked}
                ok={ok}
                showPrompt={showPrompt}
                readOnly={readOnly}
                variant="embedded"
                feedback={codeFeedback}
                explanation={codeExplanation}
                feedbackDismissed={feedbackDismissed}
                sqlDialect={resolvedEmbeddedSql.sqlDialect}
                sqlDatasetId={resolvedEmbeddedSql.sqlDatasetId}
                sqlResultShape={resolvedEmbeddedSql.sqlResultShape}
                sqlSchemaSql={resolvedEmbeddedSql.sqlSchemaSql}
                sqlSeedSql={resolvedEmbeddedSql.sqlSeedSql}
                sqlSetupSql={(exCode as any).sqlSetupSql}
                sqlInitialTableSnapshots={resolvedEmbeddedSql.sqlInitialTableSnapshots}
                exerciseRuntime={(exCode as any)?.runtime}
                exerciseSqlDatasetId={(exCode as any)?.sqlDatasetId}
                recipe={(exCode as any)?.recipe}
                subjectRuntimeDefaults={runtimeLayers.subjectRuntimeDefaults}
                courseRuntimeDefaults={runtimeLayers.courseRuntimeDefaults}
                topicRuntimeDefaults={runtimeLayers.topicRuntimeDefaults}
                sectionRuntimeDefaults={runtimeLayers.sectionRuntimeDefaults}
                moduleRuntimeDefaults={runtimeLayers.moduleRuntimeDefaults}
            />
            </>
        );
    }

    return null;
}
