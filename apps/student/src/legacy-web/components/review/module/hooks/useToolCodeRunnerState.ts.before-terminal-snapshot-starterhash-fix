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
} from "@/lib/subjects/sql/sql/runtime/resolveSqlRunnerConfig";
import type { LearningIdeConfig } from "@/lib/ide/learningIdeConfig";
import { useReviewRuntimeStore } from "../runtime/reviewRuntimeStore";
import { deriveEntryCode } from "../runtime/exerciseWorkspaceResolver";
import { reviewSaveDebug, summarizeWorkspaceForSave } from "../runtime/reviewSaveDebug";
import { getTopicProgressState, normalizeTopicProgressKey } from "@/lib/review/progressTopicKeys";
import {
    getStateLanguage,
    normalizeCodeWorkspacePair,
    stateLanguageMatches,
} from "@/components/review/module/runtime/workspaceCodeSource";
import { isI18nAliasString } from "../runtime/starterContent";

type BoundTarget = { id: string; exerciseKey?: string; onPatch: (patch: any) => void };

export type ToolStateSeed = {
    compatibleSaved: any;
    initialLang: WorkspaceLanguage;
    initialCode: string;
    initialStdin: string;
    initialWorkspace: WorkspaceStateV2 | null;
    initialWorkspaceKey: string;
    initialResolvedSql: ReturnType<typeof resolveSqlRunnerConfig>;
};

type ToolSnap = {
    topicId: string;
    toolKey: string;

    lang: WorkspaceLanguage;
    code: string;
    stdin: string;
    workspace?: WorkspaceStateV2 | null;
    workspaceKey: string;
    starterHash?: string;

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
        s.starterHash ?? "",
        s.sqlSchemaSql ?? "",
        s.sqlSeedSql ?? "",
        JSON.stringify(s.sqlInitialTableSnapshots ?? {}),
    ].join("::");
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
        .map((node) => ({
            path: filePath(node),
            content: String(node.content ?? ""),
        }))
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
        stdin: typeof workspace.stdin === "string" ? workspace.stdin : "",
        activePath: activeNode ? filePath(activeNode) : null,
        entryPath: entryNode ? filePath(entryNode) : null,
        files,
    });
}
function savedStarterStillMatches(args: {
    saved: any;
    currentStarterWorkspace: WorkspaceStateV2 | null;
}) {
    const savedStarterHash =
        typeof args.saved?.starterHash === "string" ? args.saved.starterHash : "";

    if (!savedStarterHash) {
        return false;
    }

    return savedStarterHash === workspaceKeyOf(args.currentStarterWorkspace);
}
function firstNonBlank(...values: Array<string | null | undefined>) {
    for (const value of values) {
        if (typeof value === "string" && value.trim()) return value;
    }
    return undefined;
}
function isSavedUserWork(value: any) {
    if (!value) return false;

    const origin = String(value?.workspaceOrigin ?? "").trim().toLowerCase();

    if (
        value.userEdited === false ||
        origin === "starter" ||
        origin === "manifest" ||
        origin === "default" ||
        origin === "empty" ||
        origin === "seed"
    ) {
        return false;
    }

    return (
        value.userEdited === true ||
        origin === "user" ||
        origin === "saved" ||
        origin === "reveal-fill" ||
        value?.result?.ok === true ||
        value?.correct === true
    );
}

function getStateWorkspace(value: any): WorkspaceStateV2 | null {
    if (value?.workspace?.version === 2) return value.workspace as WorkspaceStateV2;
    if (value?.codeWorkspace?.version === 2) return value.codeWorkspace as WorkspaceStateV2;
    if (value?.ideWorkspace?.version === 2) return value.ideWorkspace as WorkspaceStateV2;
    return null;
}

function resolveHydrationFallbackCode(args: {
    toolKey: string | null | undefined;
    defaultCode: string;
}) {
    return isExerciseToolKey(args.toolKey) ? "" : args.defaultCode;
}

function isGenericToolSampleCode(code: string | null | undefined) {
    const normalized = String(code ?? "").trim();
    if (!normalized) return false;

    return [
        'print("Hello Python!")',
        'print("Hello World!")',
        "SELECT 'Hello SQL' AS message;",
        'console.log("Hello JavaScript!");',
    ].includes(normalized);
}
function isExercisePlaceholderSeed(args: {
    saved: any;
    defaultCode: string;
}) {
    const value = args.saved;
    if (!value) return false;

    const origin = String(value?.workspaceOrigin ?? "").trim().toLowerCase();

    const passiveOrigin =
        origin === "starter" ||
        origin === "manifest" ||
        origin === "default" ||
        origin === "empty" ||
        origin === "seed";

    const workspace = getStateWorkspace(value);
    const entryCode = deriveEntryCode(workspace);
    const code =
        typeof entryCode === "string" && entryCode.trim()
            ? entryCode
            : typeof value?.code === "string"
                ? value.code
                : "";

    const normalizedCode = String(code).trim();
    const normalizedDefaultCode = String(args.defaultCode ?? "").trim();
    const codeIsAlias = isI18nAliasString(normalizedCode);
    const savedUserWork = isSavedUserWork(value);
    const noEditorContent =
        (!normalizedCode || codeIsAlias) &&
        !workspaceHasNonBlankEntryCode(workspace);

    if (savedUserWork && !codeIsAlias) {
        return false;
    }

    /**
     * Tool seed snapshots that came from starter/default are not learner work.
     * They should not beat a fresh target's current starter/default.
     */
    if (passiveOrigin) {
        return true;
    }

    /**
     * Explicitly non-user snapshots are also passive unless they are marked as
     * real saved/user work by isSavedUserWork().
     */
    if (value.userEdited === false) {
        return true;
    }

    if (codeIsAlias) {
        return true;
    }

    /**
     * Exercise-scoped tools intentionally hydrate with defaultCode="".
     * A blank passive snapshot must still be treated as placeholder state or it
     * can overwrite a newly resolved authored starter on refresh.
     */
    if (noEditorContent && !savedUserWork) {
        return true;
    }

    return (
        (normalizedDefaultCode.length > 0 && normalizedCode === normalizedDefaultCode) ||
        isGenericToolSampleCode(normalizedCode)
    );
}

export function resolveToolStateSeed(args: {
    saved: any;
    defaultLang: WorkspaceLanguage;
    defaultCode: string;
    defaultStdin: string;
    defaultSqlDialect: SqlDialect;
}): ToolStateSeed {
    const compatibleSaved = (() => {
        if (!args.saved) return null;
        if (isExercisePlaceholderSeed({ saved: args.saved, defaultCode: args.defaultCode })) {
            return null;
        }
        const savedWorkspace = getStateWorkspace(args.saved);
        return stateLanguageMatches(args.saved, args.defaultLang, savedWorkspace)
            ? args.saved
            : null;
    })();

    const initialLang =
        getStateLanguage(compatibleSaved, getStateWorkspace(compatibleSaved)) ??
        args.defaultLang;
    const initialWorkspace =
        compatibleSaved?.workspace && typeof compatibleSaved.workspace === "object"
            ? (compatibleSaved.workspace as WorkspaceStateV2)
            : null;
    const initialCode =
        deriveEntryCode(initialWorkspace) ||
        (typeof compatibleSaved?.code === "string"
            ? compatibleSaved.code
            : args.defaultCode);
    const initialStdin =
        typeof initialWorkspace?.stdin === "string"
            ? initialWorkspace.stdin
            : typeof compatibleSaved?.stdin === "string"
                ? compatibleSaved.stdin
                : args.defaultStdin;
    const initialWorkspaceKey = workspaceKeyOf(initialWorkspace);
    const initialResolvedSql = resolveSqlRunnerConfig({
        language: initialLang,
        sqlDialect: (compatibleSaved?.sqlDialect as SqlDialect) ?? args.defaultSqlDialect,
        sqlDatasetId:
            typeof compatibleSaved?.sqlDatasetId === "string"
                ? compatibleSaved.sqlDatasetId
                : undefined,
        sqlSchemaSql:
            typeof compatibleSaved?.sqlSchemaSql === "string"
                ? compatibleSaved.sqlSchemaSql
                : undefined,
        sqlSeedSql:
            typeof compatibleSaved?.sqlSeedSql === "string"
                ? compatibleSaved.sqlSeedSql
                : undefined,
        sqlInitialTableSnapshots:
            compatibleSaved?.sqlInitialTableSnapshots &&
            typeof compatibleSaved.sqlInitialTableSnapshots === "object"
                ? (compatibleSaved.sqlInitialTableSnapshots as SqlTableSnapshots)
                : undefined,
        defaultSqlDialect: args.defaultSqlDialect,
    });

    return {
        compatibleSaved,
        initialLang,
        initialCode,
        initialStdin,
        initialWorkspace,
        initialWorkspaceKey,
        initialResolvedSql,
    };
}

function workspaceWithEntryCode(
    workspace: WorkspaceStateV2 | null | undefined,
    code: string,
): WorkspaceStateV2 | null {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return workspace ?? null;
    }

    const preferredEntryId = workspace.entryFileId || workspace.activeFileId;
    const fallbackFile = workspace.nodes.find((node) => node.kind === "file");
    const entryId = workspace.nodes.some(
        (node) => node.kind === "file" && node.id === preferredEntryId,
    )
        ? preferredEntryId
        : fallbackFile?.id;
    if (!entryId) return workspace;

    let changed = false;

    const nodes = workspace.nodes.map((node) => {
        if (node.kind !== "file" || node.id !== entryId) return node;
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

function workspaceHasNonBlankEntryCode(workspace: WorkspaceStateV2 | null | undefined) {
    const code = String(deriveEntryCode(workspace) ?? "").trim();
    return Boolean(code) && !isI18nAliasString(code);
}

function hydrateWorkspaceShellWithCode(
    workspace: WorkspaceStateV2 | null | undefined,
    code: string | null | undefined,
) {
    const nextCode = String(code ?? "");
    if (!nextCode.trim()) return workspace ?? null;
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return workspace ?? null;
    }
    if (workspaceHasNonBlankEntryCode(workspace)) return workspace;
    return workspaceWithEntryCode(workspace, nextCode);
}


function ideConfigKey(config: LearningIdeConfig | null | undefined) {
    const normalize = (input: unknown): unknown => {
        if (Array.isArray(input)) {
            return input.map(normalize);
        }

        if (input && typeof input === "object") {
            return Object.fromEntries(
                Object.entries(input as Record<string, unknown>)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([key, value]) => [key, normalize(value)]),
            );
        }

        return input ?? null;
    };

    return JSON.stringify(normalize(config ?? null));
}


function resolveExerciseStoreKey(
    exercises: Record<string, any>,
    inputId: string | null | undefined,
    explicitExerciseKey?: string | null,
) {
    const canonicalExplicitExerciseKey = canonicalizeExerciseStateKey(explicitExerciseKey);
    if (canonicalExplicitExerciseKey && exercises[canonicalExplicitExerciseKey]) {
        return canonicalExplicitExerciseKey;
    }
    if (canonicalExplicitExerciseKey) return canonicalExplicitExerciseKey;

    if (inputId && exercises[inputId]) return inputId;

    if (inputId) {
        const found = Object.entries(exercises).find(([key, value]) => {
            if (!value) return false;

            return (
                value.exerciseId === inputId ||
                value.exerciseKey === inputId ||
                key.endsWith(`:${inputId}`)
            );
        });

        if (found) return found[0];
    }

    return inputId ?? null;
}

function canonicalizeExerciseStateKey(exerciseKey: string | null | undefined) {
    if (typeof exerciseKey !== "string") return null;

    const raw = exerciseKey.trim();
    if (!raw) return null;

    const parts = raw.split(":").filter(Boolean);
    if (parts.length < 6) return raw;

    const [subjectSlug, moduleSlug, sectionSlug, topicId, cardId, ...exerciseParts] = parts;
    if (!exerciseParts.length) return raw;

    const normalizedTopicId = normalizeTopicProgressKey(topicId);

    return [
        subjectSlug,
        moduleSlug,
        sectionSlug,
        normalizedTopicId,
        cardId,
        ...exerciseParts,
    ].join(":");
}

function isExerciseToolKey(toolKey: string | null | undefined) {
    return typeof toolKey === "string" && toolKey.startsWith("exercise:");
}

function matchesExerciseStateScopeKey(value: string | null | undefined) {
    if (typeof value !== "string") return false;

    const raw = value.trim();
    if (!raw || raw.startsWith("exercise:") || raw.startsWith("card:")) return false;

    const parts = raw.split(":").filter(Boolean);

    // subject:module:section:topic:card:exercise...
    return parts.length >= 6 && parts[parts.length - 1] !== "general";
}

function isCardToolKey(toolKey: string | null | undefined) {
    if (typeof toolKey !== "string" || !toolKey.trim()) return false;
    if (isExerciseToolKey(toolKey)) return false;

    // Legacy card scope.
    if (toolKey.startsWith("card:")) return true;

    // Current review card/sketch scope shapes:
    // subject:module:topic:cardId:general
    // subject:module:section:topic:cardId
    //
    // The second shape is what CodeRunner logs as editorOwnerKey/cardRuntimeKey.
    // Treat any non-exercise review tool key as a card/sketch tool key so edits
    // are persisted through patchCard.
    return true;
}

function cardIdFromToolKey(toolKey: string) {
    if (toolKey.startsWith("card:")) {
        return toolKey.replace(/^card:/, "");
    }

    const parts = toolKey.split(":").filter(Boolean);

    if (parts.length >= 2 && parts[parts.length - 1] === "general") {
        return parts[parts.length - 2];
    }

    return parts[parts.length - 1] || toolKey;
}

function cardStateKeyFromToolKey(toolKey: string) {
    if (toolKey.startsWith("card:")) return toolKey.replace(/^card:/, "");
    if (toolKey.endsWith(":general")) return toolKey.replace(/:general$/, "");

    // Keep the full current review scope key.
    // This must match CodeToolPane/CodeRunner editorOwnerKey/cardRuntimeKey.
    return toolKey;
}

function cardToolWorkspaceStorageKey(topicId: string, toolKey: string) {
    return `zoe:review-card-tool-workspace:${topicId}:${toolKey}`;
}

function writeCardToolWorkspaceBackup(args: {
    topicId: string;
    toolKey: string;
    snap: {
        lang?: string;
        code?: string;
        stdin?: string;
        workspace?: WorkspaceStateV2 | null;
    };
}) {
    if (typeof window === "undefined") return;
    if (!args.snap.workspace) return;

    const cardId = cardIdFromToolKey(args.toolKey);

    const aliases = Array.from(
        new Set([
            args.toolKey,
            `card:${cardId}`,
        ]),
    );

    const payload = JSON.stringify({
        savedAt: Date.now(),
        lang: args.snap.lang,
        code: args.snap.code,
        stdin: args.snap.stdin,
        workspace: args.snap.workspace,
    });

    try {
        aliases.forEach((toolKey) => {
            window.localStorage.setItem(
                cardToolWorkspaceStorageKey(args.topicId, toolKey),
                payload,
            );
        });
    } catch {
        // local backup is best-effort
    }
}

function readCardToolWorkspaceBackup(topicId: string, toolKey: string) {
    if (typeof window === "undefined") return null;

    const cardId = cardIdFromToolKey(toolKey);

    function parse(raw: string | null) {
        if (!raw) return null;

        try {
            const parsed = JSON.parse(raw);
            if (!parsed?.workspace || parsed.workspace.version !== 2) return null;
            return parsed;
        } catch {
            return null;
        }
    }

    const exact = parse(
        window.localStorage.getItem(
            cardToolWorkspaceStorageKey(topicId, toolKey),
        ),
    );
    if (exact) return exact;

    const legacyToolKey = `card:${cardId}`;
    const legacy = parse(
        window.localStorage.getItem(
            cardToolWorkspaceStorageKey(topicId, legacyToolKey),
        ),
    );
    if (legacy) return legacy;

    const prefix = `zoe:review-card-tool-workspace:${topicId}:`;

    for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (!key || !key.startsWith(prefix)) continue;

        const storedToolKey = key.slice(prefix.length);

        if (cardIdFromToolKey(storedToolKey) !== cardId) continue;

        const candidate = parse(window.localStorage.getItem(key));
        if (candidate) return candidate;
    }

    return null;
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

    const exercises = useReviewRuntimeStore((s) => s.exercises);
    const patchCard = useReviewRuntimeStore((s) => s.patchCard);
    const patchExercise = useReviewRuntimeStore((s) => s.patchExercise);

    const versionStr = useMemo(() => {
        const moduleV = (progress as any)?.quizVersion ?? 0;
        const topicV = (progress as any)?.topics?.[viewTid]?.quizVersion ?? 0;
        return `${moduleV}.${topicV}`;
    }, [progress, viewTid]);

    const boundRef = useRef<BoundTarget | null>(null);
    const [boundId, setBoundId] = useState<string | null>(null);
    const boundDirtyRef = useRef(false);
    const lastBindKeyRef = useRef<string>("");
    const bindingContext = useMemo(
        () => `${viewTid}::${scopeKey}::${versionStr}`,
        [viewTid, scopeKey, versionStr],
    );
    const boundContextRef = useRef<string>("");
    const effectiveBoundId =
        boundContextRef.current === bindingContext ? boundId : null;
    const isBound = useCallback(
        (id: string) =>
            boundContextRef.current === bindingContext && boundRef.current?.id === id,
        [bindingContext],
    );

    const clearBoundState = useCallback(() => {
        boundRef.current = null;
        boundContextRef.current = "";
        boundDirtyRef.current = false;
        lastBindKeyRef.current = "";
        setBoundId((prev) => (prev === null ? prev : null));
        setHydratedToolIdentity("");
    }, []);

    const scopeKeyIsExercise = matchesExerciseStateScopeKey(scopeKey);
    const effectiveToolKey = effectiveBoundId
        ? `exercise:${effectiveBoundId}`
        : scopeKeyIsExercise
            ? `exercise:${scopeKey}`
            : scopeKey;
    const effectiveDefaultCode = useMemo(
        () =>
            resolveHydrationFallbackCode({
                toolKey: effectiveToolKey,
                defaultCode,
            }),
        [effectiveToolKey, defaultCode],
    );
    const toolIdentity = useMemo(
        () => `${viewTid}::${effectiveToolKey}::${versionStr}`,
        [viewTid, effectiveToolKey, versionStr],
    );

    const saved = useMemo(() => {
        if (isCardToolKey(effectiveToolKey)) {
            return null;
        }
        if (effectiveBoundId) {
            const storeKey = resolveExerciseStoreKey(exercises, effectiveBoundId);
            const found = storeKey ? exercises[storeKey] ?? null : null;
            if (found) return found;

            if (effectiveBoundId.includes(":")) return null;
        }

        /**
         * Exercise routes can reach the tool pane before the formal bind step
         * completes. In that window, prefer the already-created runtime
         * exercise over topic.toolState so a stale blank saved snapshot does not
         * win against the manifest-backed starter workspace.
         */
        // const pendingExerciseStoreKey = resolveExerciseStoreKey(
        //     exercises,
        //     effectiveToolKey,
        //     scopeKey,
        // );
        // const pendingExercise =
        //     pendingExerciseStoreKey ? exercises[pendingExerciseStoreKey] ?? null : null;
        // if (pendingExercise) return pendingExercise;

        const resolved = getTopicProgressState((progress as any)?.topics ?? {}, viewTid);
        const progressSaved =
            (resolved.topic as any)?.toolState?.[effectiveToolKey] ?? null;

        function isUserWork(value: any) {
            if (!value) return false;

            if (
                value.workspaceOrigin === "starter" ||
                value.workspaceOrigin === "empty"
            ) {
                return false;
            }

            return (
                value.userEdited === true ||
                value.workspaceOrigin === "user" ||
                value.workspaceOrigin === "saved" ||
                value?.result?.ok === true ||
                value?.correct === true
            );
        }

        if (effectiveBoundId) {
            const storeKey = resolveExerciseStoreKey(exercises, effectiveBoundId);
            const found = storeKey ? exercises[storeKey] ?? null : null;

            if (isUserWork(progressSaved) && !isUserWork(found)) {
                return progressSaved;
            }

            if (found) return found;

            if (effectiveBoundId.includes(":")) return null;
        }

        const pendingExerciseStoreKey = resolveExerciseStoreKey(
            exercises,
            effectiveToolKey,
            scopeKey,
        );
        const pendingExercise =
            pendingExerciseStoreKey ? exercises[pendingExerciseStoreKey] ?? null : null;

        const resolvedSaved =
            isUserWork(progressSaved) && !isUserWork(pendingExercise)
                ? progressSaved
                : pendingExercise ?? progressSaved;

        if (
            isExerciseToolKey(effectiveToolKey) &&
            isExercisePlaceholderSeed({
                saved: resolvedSaved,
                defaultCode,
            })
        ) {
            return null;
        }

        return resolvedSaved;
    }, [progress, viewTid, effectiveToolKey, effectiveBoundId, exercises, scopeKey, defaultCode]);

    const {
        compatibleSaved,
        initialLang,
        initialCode,
        initialStdin,
        initialWorkspace,
        initialWorkspaceKey,
        initialResolvedSql,
    } = useMemo(
        () =>
            resolveToolStateSeed({
                saved,
                defaultLang,
                defaultCode: effectiveDefaultCode,
                defaultStdin,
                defaultSqlDialect,
            }),
        [saved, defaultLang, effectiveDefaultCode, defaultStdin, defaultSqlDialect],
    );

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
        if (effectiveBoundId == null) {
            setToolIdeConfigIfChanged(null);
        }
    }, [effectiveBoundId, setToolIdeConfigIfChanged]);

    const latestSnapRef = useRef<ToolSnap>({
        topicId: viewTid,
        toolKey: effectiveToolKey,
        lang: initialLang,
        code: initialCode,
        stdin: initialStdin,
        workspace: initialWorkspace,
        workspaceKey: initialWorkspaceKey,
        starterHash:
            typeof compatibleSaved?.starterHash === "string" ? compatibleSaved.starterHash : "",
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
            starterHash: latestSnapRef.current.starterHash ?? "",
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
            if (isCardToolKey(toolKey)) return;
            const topicKey = normalizeTopicProgressKey(topicId);
            const exerciseKey = isExerciseToolKey(toolKey)
                ? toolKey.replace(/^exercise:/, "")
                : null;
            const starterHash = latest.starterHash ?? latestSnapRef.current.starterHash ?? "";

            const latestWorkspaceIsStarter =
                Boolean(starterHash) && latest.workspaceKey === starterHash;

            const latestWorkspaceIsUserWork =
                Boolean(latest.workspace) && !latestWorkspaceIsStarter;

            const nextWorkspaceOrigin = latestWorkspaceIsUserWork ? "user" : "starter";

            /**
             * Passive starter/default hydration is not learner progress.
             * It must not create DB/toolState rows for locked routes or overwrite
             * saved user work. The live runtime exercise may still be registered
             * by bindCodeInput/ensureExercise so Run/Check can read the contract.
             */
            if (!latestWorkspaceIsUserWork) {
                return;
            }

            if (exerciseKey && latest.workspace) {
                const runtimeApi = useReviewRuntimeStore.getState();
                const existingExercise = runtimeApi.exercises?.[exerciseKey] ?? null;
                const workspaceCode = deriveEntryCode(latest.workspace);

                const existingExerciseIsUserWork = isSavedUserWork(existingExercise);
                const existingExerciseWorkspaceKey = workspaceKeyOf(
                    existingExercise?.workspace ?? null,
                );

                const shouldPreserveExistingExerciseWorkspace =
                    latestWorkspaceIsStarter &&
                    existingExerciseIsUserWork &&
                    existingExerciseWorkspaceKey !== latest.workspaceKey;

                if (!shouldPreserveExistingExerciseWorkspace) {
                    const nextCode = workspaceCode || latest.code;
                    const nextStarterHash = starterHash || existingExercise?.starterHash;

                    /**
                     * Critical SQL/navigation guard:
                     *
                     * During sidebar navigation, CodeToolPane/FullIDE cleanup can flush the same
                     * workspace more than once. If we always patch the runtime store with a fresh
                     * updatedAt timestamp, subscribers see a new runtime object, rehydrate FullIDE,
                     * then flush again. SQL review tests catch this as a React maximum update
                     * depth loop.
                     *
                     * Only patch the exercise runtime when something meaningful changed.
                     */
                    const existingRuntimeWorkspaceKey = workspaceKeyOf(
                        existingExercise?.workspace ?? null,
                    );

                    const runtimeAlreadyMatches =
                        existingExercise?.language === latest.lang &&
                        existingExercise?.lang === latest.lang &&
                        existingRuntimeWorkspaceKey === latest.workspaceKey &&
                        existingExercise?.stdin === latest.stdin &&
                        existingExercise?.codeStdin === latest.stdin &&
                        existingExercise?.code === nextCode &&
                        existingExercise?.source === nextCode &&
                        existingExercise?.userEdited === latestWorkspaceIsUserWork &&
                        existingExercise?.workspaceOrigin === nextWorkspaceOrigin &&
                        existingExercise?.workspaceStatus === "ready" &&
                        (existingExercise?.starterHash ?? "") === (nextStarterHash ?? "") &&
                        existingExercise?.topicId === (existingExercise?.topicId ?? topicId) &&
                        existingExercise?.exerciseKey === exerciseKey;

                    if (!runtimeAlreadyMatches) {
                        runtimeApi.patchExercise(exerciseKey, {
                            language: latest.lang,
                            lang: latest.lang,
                            workspace: latest.workspace,
                                codeWorkspace: latest.workspace,
                                ideWorkspace: latest.workspace,
                            stdin: latest.stdin,
                            codeStdin: latest.stdin,
                            code: nextCode,
                            source: nextCode,

                                userEdited: latestWorkspaceIsUserWork,
                                workspaceOrigin: nextWorkspaceOrigin,

                            workspaceStatus: "ready",
                                starterHash: nextStarterHash,
                            updatedAt: Date.now(),

                            subjectSlug: existingExercise?.subjectSlug,
                            moduleSlug: existingExercise?.moduleSlug,
                            sectionSlug: existingExercise?.sectionSlug,
                            topicId: existingExercise?.topicId ?? topicId,
                            cardId: existingExercise?.cardId,
                            exerciseId: existingExercise?.exerciseId,
                            exerciseKey,
                        });
                    }
                }            }
            setProgress((p: any) => {
                const tp0: any = p?.topics?.[topicKey] ?? {};
                const prevToolState = tp0?.toolState?.[toolKey] ?? null;
                const prevToolStateIsUserWork = isSavedUserWork(prevToolState);
                const prevToolStateWorkspaceKey = workspaceKeyOf(
                    prevToolState?.workspace ?? null,
                );

                const shouldPreservePreviousToolState =
                    latestWorkspaceIsStarter &&
                    prevToolStateIsUserWork &&
                    prevToolStateWorkspaceKey !== latest.workspaceKey;

                if (shouldPreservePreviousToolState) {
                    return p;
                }
                const workspaceCode = deriveEntryCode(latest.workspace);
                const nextToolCode = workspaceCode || latest.code;

                if (
                    prevToolState?.lang === latest.lang &&
                    prevToolState?.code === nextToolCode &&
                    prevToolState?.stdin === latest.stdin &&
                    workspaceKeyOf(prevToolState?.workspace ?? null) === latest.workspaceKey &&
                    (prevToolState?.starterHash ?? "") === (starterHash ?? "") &&
                    prevToolState?.userEdited === latestWorkspaceIsUserWork &&
                    prevToolState?.workspaceOrigin === nextWorkspaceOrigin &&
                    prevToolState?.sqlDialect === latest.sqlDialect &&
                    prevToolState?.sqlDatasetId === latest.sqlDatasetId &&
                    prevToolState?.sqlSchemaSql === latest.sqlSchemaSql &&
                    prevToolState?.sqlSeedSql === latest.sqlSeedSql &&
                    JSON.stringify(prevToolState?.sqlInitialTableSnapshots ?? {}) ===
                    JSON.stringify(latest.sqlInitialTableSnapshots ?? {})
                ) {
                    return p;
                }

                // const workspaceCode = deriveEntryCode(latest.workspace);



                const toolState = { ...(tp0.toolState ?? {}) };

                const nextToolEntry = {
                    lang: latest.lang,
                    code: workspaceCode || latest.code,
                    stdin: latest.stdin,
                    workspace: latest.workspace ?? null,

                        userEdited: latestWorkspaceIsUserWork,
                        workspaceOrigin: nextWorkspaceOrigin as "user" | "starter",
                    updatedAt: Date.now(),

                    starterHash,
                        sqlDialect: latest.sqlDialect,
                        sqlDatasetId: latest.sqlDatasetId,
                        sqlSchemaSql: latest.sqlSchemaSql,
                        sqlSeedSql: latest.sqlSeedSql,
                        sqlInitialTableSnapshots: latest.sqlInitialTableSnapshots,
                };



                toolState[toolKey] = nextToolEntry;
                return {
                    ...p,
                    topics: {
                        ...(p?.topics ?? {}),
                        [topicKey]: { ...tp0, toolState },
                    },
                };
            });
        },
        [setProgress],
    );

    const flushToolSnapshot = useReviewRuntimeStore((s) => s.flushToolSnapshot);

    const { prime, flush, cancel } = useDebouncedCommit({
        value: toolSnap,
        enabled: progressHydrated && toolHydrated,
        delayMs: toolSaveDelayMs,
        serialize: snapKey,
        commit: async (latest) => {
            flushToolSnapshot();
            await commitToolToProgress(latest);
        },
    });

    const flushLatest = useCallback(async () => {
        cancel();

        const latest = latestSnapRef.current;
        if (!progressHydrated) return;
        if (`${latest.topicId}::${latest.toolKey}::${versionStr}` !== toolIdentity) return;

        prime(latest);
        flushToolSnapshot();
        await commitToolToProgress(latest);
    }, [cancel, prime, commitToolToProgress, progressHydrated, toolIdentity, versionStr, flushToolSnapshot]);

    const canPreserveCurrentBoundContext = useCallback(() => {
        const bound = boundRef.current;
        if (!bound) return false;

        const latest = latestSnapRef.current;

        /**
         * Critical:
         * Never preserve a bound editor snapshot across topic changes.
         *
         * The old code was preserving the old boundRef whenever viewTid/scopeKey
         * changed, then retagging it with the new bindingContext/toolIdentity.
         * That made old editor code look like it belonged to the new exercise.
         */
        if (latest.topicId !== viewTid) {
            return false;
        }

        const targetKey = String(bound.exerciseKey ?? bound.id ?? "").trim();
        if (!targetKey) return false;

        if (effectiveToolKey === `exercise:${targetKey}`) {
            return true;
        }

        if (scopeKey === targetKey) {
            return true;
        }

        if (matchesExerciseStateScopeKey(scopeKey)) {
            const normalizedScope = String(scopeKey).trim().toLowerCase();
            const normalizedTarget = targetKey.toLowerCase();

            return (
                normalizedScope === normalizedTarget ||
                normalizedScope.includes(normalizedTarget) ||
                normalizedTarget.includes(normalizedScope)
            );
        }

        return false;
    }, [effectiveToolKey, scopeKey, viewTid]);

    const preserveCurrentBoundContext = useCallback(() => {
        if (!canPreserveCurrentBoundContext()) {
            return false;
        }

        boundContextRef.current = bindingContext;
        setHydratedToolIdentity(toolIdentity);
        return true;
    }, [bindingContext, canPreserveCurrentBoundContext, toolIdentity]);

    const lastNavigationContextRef = useRef<{
        viewTid: string;
        scopeKey: string;
        versionStr: string;
    } | null>(null);

    useEffect(() => {
        const previous = lastNavigationContextRef.current;

        if (progressHydrated && previous) {
            void commitToolToProgress(latestSnapRef.current);
        }

        const topicChanged = Boolean(previous && previous.viewTid !== viewTid);
        const scopeChanged = Boolean(previous && previous.scopeKey !== scopeKey);
        const versionChanged = Boolean(previous && previous.versionStr !== versionStr);

        lastNavigationContextRef.current = {
            viewTid,
            scopeKey,
            versionStr,
        };

        if (!previous) {
            return;
        }

        if (topicChanged || scopeChanged || versionChanged) {
            if (!preserveCurrentBoundContext()) {
                clearBoundState();
            }
        }
    }, [
        viewTid,
        scopeKey,
        versionStr,
        progressHydrated,
        commitToolToProgress,
        clearBoundState,
        preserveCurrentBoundContext,
    ]);
    useEffect(() => {
        if (!progressHydrated) return;
        if (boundRef.current) return;

        let s: any = null;
        if (effectiveBoundId) {
            const storeKey = resolveExerciseStoreKey(exercises, effectiveBoundId);
            s = storeKey ? exercises[storeKey] ?? null : null;
        } else {
            const pendingExerciseStoreKey = !isCardToolKey(effectiveToolKey)
                ? resolveExerciseStoreKey(exercises, effectiveToolKey, scopeKey)
                : null;
            const pendingExercise =
                pendingExerciseStoreKey ? exercises[pendingExerciseStoreKey] ?? null : null;

            if (pendingExercise) {
                s = pendingExercise;
            } else {
                const cardKey = isCardToolKey(effectiveToolKey)
                    ? cardStateKeyFromToolKey(effectiveToolKey)
                    : null;

                const runtimeCards = useReviewRuntimeStore.getState().cards ?? {};
                const runtimeCard = cardKey
                    ? runtimeCards[cardKey] ?? null
                    : null;

                if (runtimeCard?.workspaceStatus === "ready" && runtimeCard?.toolWorkspace) {
                    s = {
                        lang: runtimeCard.toolLang ?? defaultLang,
                        code: runtimeCard.toolCode ?? "",
                        stdin: runtimeCard.toolStdin ?? "",
                        workspace: runtimeCard.toolWorkspace,
                    };
                }
            }
        }
        if (
            isExerciseToolKey(effectiveToolKey) &&
            isExercisePlaceholderSeed({
                saved: s,
                defaultCode,
            })
        ) {
            s = null;
        }

        /**
         * Important:
         * Even when there is no saved state for the current topic/tool yet,
         * we must still reset latestSnapRef to the CURRENT viewTid/effectiveToolKey.
         *
         * Otherwise edits in a new topic can be committed under the previous
         * topic/tool key, which makes refresh restore the starter code.
         */
        const nextLang = (s?.lang as WorkspaceLanguage) ?? defaultLang;

        const nextWorkspace =
            s?.workspace && typeof s.workspace === "object"
                ? (s.workspace as WorkspaceStateV2)
                : null;

        const currentStarterHash =
            typeof s?.starterHash === "string" && s.starterHash
                ? s.starterHash
                : "";

        const nextCode =
            deriveEntryCode(nextWorkspace) ||
            (typeof s?.code === "string" ? s.code : effectiveDefaultCode);
        const nextStdin =
            typeof nextWorkspace?.stdin === "string"
                ? nextWorkspace.stdin
                : typeof s?.stdin === "string"
                    ? s.stdin
                    : defaultStdin;

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
            topicId: viewTid,
            toolKey: effectiveToolKey,
            lang: nextLang,
            code: nextCode,
            stdin: nextStdin,
            workspace: nextWorkspace,
            workspaceKey: workspaceKeyOf(nextWorkspace),
            starterHash: currentStarterHash,
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
        effectiveDefaultCode,
        defaultStdin,
        defaultSqlDialect,
        prime,
        hydratedToolIdentity,
        exercises,
        effectiveBoundId,
    ]);

    const bindCodeInput = useCallback(
        async (args2: {
            id: string;
            ownerCardId?: string | null;
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
            exerciseKey?: string;
            preferSnapshot?: boolean;
            userEdited?: boolean;
            workspaceOrigin?: "user" | "saved" | "starter" | "empty" | string;
            onPatch: (patch: any) => void;
        }) => {
            if (boundRef.current && boundRef.current.id !== args2.id) {
                await flushLatest();
            }
            const resolvedSql = resolveSqlRunnerConfig({
                language: args2.lang,
                    sqlDialect: args2.sqlDialect ?? defaultSqlDialect,
                    sqlDatasetId: args2.sqlDatasetId,
                    sqlSchemaSql: args2.sqlSchemaSql,
                    sqlSeedSql: args2.sqlSeedSql,
                    sqlInitialTableSnapshots: args2.sqlInitialTableSnapshots,
                defaultSqlDialect,
            });

            const inputId = args2.id;
            const targetKey = resolveExerciseStoreKey(
                exercises,
                inputId,
                args2.exerciseKey ?? null,
            ) ?? inputId;

            const incomingPair = normalizeCodeWorkspacePair({
                workspace: args2.workspace ?? null,
                code: args2.code,
                language: args2.lang,
                stdin: args2.stdin,
                state: args2,
            });

            const nextWorkspace = incomingPair.workspace;
            const nextCode = incomingPair.code;

            const currentStarterHash = workspaceKeyOf(nextWorkspace);

            const nextToolKey = `exercise:${targetKey}`;
            const nextIdentity = `${viewTid}::${nextToolKey}::${versionStr}`;
            const snapshotOverridesSaved = args2.preferSnapshot === true;



            const runtimeSaved = exercises[targetKey] ?? null;

            const topicProgressForBind =
                getTopicProgressState((progress as any)?.topics ?? {}, viewTid).topic as any;

            const progressToolStateSaved =
                topicProgressForBind?.toolState?.[nextToolKey] ?? null;

            const progressRuntimeExercises =
                topicProgressForBind?.runtimeStateV2?.exercises ?? {};

            const progressRuntimeExerciseKey =
                resolveExerciseStoreKey(
                    progressRuntimeExercises,
                    inputId,
                    targetKey,
                ) ??
                resolveExerciseStoreKey(
                    progressRuntimeExercises,
                    targetKey,
                    args2.exerciseKey ?? null,
                );

            const progressRuntimeExerciseSaved =
                progressRuntimeExerciseKey
                    ? progressRuntimeExercises[progressRuntimeExerciseKey] ?? null
                    : null;

            function isUserWork(value: any) {
                return isSavedUserWork(value);
            }

            function languageMatches(value: any) {
                return stateLanguageMatches(
                    value,
                    args2.lang,
                    getStateWorkspace(value),
                );
            }

            function savedStarterMatchesCurrent(value: any) {
                if (!value) return false;
                if (!languageMatches(value)) return false;

                const savedStarterHash =
                    typeof value?.starterHash === "string" ? value.starterHash : "";

                return Boolean(savedStarterHash && savedStarterHash === workspaceKeyOf(nextWorkspace));
            }

            function isPassiveSeedSnapshot(value: any) {
                const origin = String(value?.workspaceOrigin ?? "").trim().toLowerCase();

                return (
                    value?.userEdited === false ||
                    origin === "starter" ||
                    origin === "manifest" ||
                    origin === "default" ||
                    origin === "empty" ||
                    origin === "seed"
                );
            }

            function belongsToCurrentExercise(value: any) {
                if (!value) return false;

                return (
                    value.exerciseKey === targetKey ||
                    value.exerciseId === inputId ||
                    value.id === inputId ||
                    String(targetKey).endsWith(`:${inputId}`)
                );
            }

            function savedCanOverrideStarter(value: any) {
                if (!value) return false;
                if (!languageMatches(value)) return false;
                if (isPassiveSeedSnapshot(value)) return false;

                /**
                 * Real learner work wins even if the manifest starter changed.
                 * This is the saved > starter > default contract.
                 */
                if (isUserWork(value)) {
                    return true;
                }

                /**
                 * Non-user legacy snapshots only win when they still match the current
                 * starter. Otherwise they are stale.
                 */
                return savedStarterMatchesCurrent(value);
            }

            const progressSavedCandidates = [
                progressToolStateSaved,
                progressRuntimeExerciseSaved,
            ].filter((candidate) => Boolean(candidate) && languageMatches(candidate));

            const progressSavedUserMatch =
                progressSavedCandidates.find((candidate) => {
                    if (!isUserWork(candidate)) return false;

                    /**
                     * runtimeStateV2 exercises have exercise identity.
                     * toolState entries may not, but they were already read from the exact
                     * current tool key, so they are allowed if they are real user work.
                     */
                    return belongsToCurrentExercise(candidate) || candidate === progressToolStateSaved;
                }) ?? null;

            const progressSaved =
                progressSavedUserMatch ??
                (languageMatches(progressToolStateSaved) ? progressToolStateSaved : null) ??
                (languageMatches(progressRuntimeExerciseSaved) ? progressRuntimeExerciseSaved : null) ??
                null;

            const compatibleRuntimeSaved =
                languageMatches(runtimeSaved) ? runtimeSaved : null;

            const runtimeSavedIsUserWork = isUserWork(compatibleRuntimeSaved);
            const progressSavedIsUserWork = isUserWork(progressSaved);

            const savedForBind =
                snapshotOverridesSaved
                    ? null
                    : progressSaved &&
                    progressSavedIsUserWork &&
                    !runtimeSavedIsUserWork
                        ? progressSaved
                        : compatibleRuntimeSaved ?? progressSaved ?? null;

            const effectiveSavedForBind =
                isExercisePlaceholderSeed({
                    saved: savedForBind,
                    defaultCode,
                })
                    ? null
                    : savedForBind;

            const savedWorkspace = hydrateWorkspaceShellWithCode(
                effectiveSavedForBind?.workspace && typeof effectiveSavedForBind.workspace === "object"
                    ? (effectiveSavedForBind.workspace as WorkspaceStateV2)
                    : null,
                typeof effectiveSavedForBind?.code === "string" ? effectiveSavedForBind.code : "",
            );

            const savedWorkspaceCode = deriveEntryCode(savedWorkspace);
            const incomingWorkspaceCode = deriveEntryCode(nextWorkspace);

            const effectiveSavedIsUserWork = Boolean(
                effectiveSavedForBind &&
                !isPassiveSeedSnapshot(effectiveSavedForBind) &&
                isUserWork(effectiveSavedForBind),
            );

            const effectiveSavedStarterMatchesCurrent =
                savedStarterMatchesCurrent(effectiveSavedForBind);

            const shouldUseSavedWorkspace =
                !!savedWorkspace &&
                (effectiveSavedIsUserWork || effectiveSavedStarterMatchesCurrent) &&
                !(
                    String(savedWorkspaceCode ?? "").trim() === "" &&
                    String(incomingWorkspaceCode ?? "").trim() !== ""
                );
            const existingExerciseForBind = exercises[targetKey] ?? null;
            const existingExerciseForBindIsUserWork = isSavedUserWork(existingExerciseForBind);
            const existingExerciseForBindWorkspaceKey = workspaceKeyOf(
                existingExerciseForBind?.workspace ?? null,
            );
            const existingExerciseForBindMatchesTarget = Boolean(
                existingExerciseForBind &&
                (
                    existingExerciseForBind.exerciseKey === targetKey ||
                    existingExerciseForBind.exerciseId === inputId
                ),
            );
            const existingExerciseForBindCode =
                deriveEntryCode(existingExerciseForBind?.workspace ?? null) ||
                (typeof existingExerciseForBind?.code === "string"
                    ? existingExerciseForBind.code
                    : "");
            const incomingBindHasContent = Boolean(
                String(incomingWorkspaceCode ?? "").trim() ||
                String(nextCode ?? "").trim(),
            );
            const existingRuntimeHasContent = Boolean(
                String(existingExerciseForBindCode ?? "").trim(),
            );
            const shouldPreserveExistingRuntimeSnapshot =
                !snapshotOverridesSaved &&
                existingExerciseForBindMatchesTarget &&
                !existingExerciseForBindIsUserWork &&
                !incomingBindHasContent &&
                existingRuntimeHasContent &&
                languageMatches(existingExerciseForBind);

            const workspaceForBind = shouldPreserveExistingRuntimeSnapshot
                ? hydrateWorkspaceShellWithCode(
                    existingExerciseForBind?.workspace ?? null,
                    existingExerciseForBindCode,
                )
                : shouldUseSavedWorkspace
                    ? savedWorkspace
                    : nextWorkspace;

            const nextSnapCode =
                deriveEntryCode(workspaceForBind) ||
                (
                    shouldPreserveExistingRuntimeSnapshot
                        ? existingExerciseForBindCode
                        : ""
                ) ||
                (typeof effectiveSavedForBind?.code === "string" && effectiveSavedForBind.code.trim() !== ""
                    ? effectiveSavedForBind.code
                    : "") ||
                (typeof nextCode === "string" ? nextCode : "");
            const hydratedWorkspaceForBind = hydrateWorkspaceShellWithCode(
                workspaceForBind,
                nextSnapCode,
            );
            const workspaceForBindCode = deriveEntryCode(hydratedWorkspaceForBind);

            const nextSnap: ToolSnap = {
                topicId: viewTid,
                toolKey: nextToolKey,
                lang: args2.lang,
                code: nextSnapCode,
                stdin:
                    typeof hydratedWorkspaceForBind?.stdin === "string"
                        ? hydratedWorkspaceForBind.stdin
                        : typeof effectiveSavedForBind?.stdin === "string"
                            ? effectiveSavedForBind.stdin
                            : typeof args2.stdin === "string"
                                ? args2.stdin
                                : "",
                workspace: hydratedWorkspaceForBind,
                workspaceKey: workspaceKeyOf(hydratedWorkspaceForBind),
                    sqlDialect:
                    (effectiveSavedForBind as any)?.sqlDialect ??
                    (effectiveSavedForBind?.workspace as any)?.sqlDialect ??
                    resolvedSql.sqlDialect,
                    sqlDatasetId: firstNonBlank(
                    (effectiveSavedForBind as any)?.sqlDatasetId,
                    (effectiveSavedForBind?.workspace as any)?.sqlDatasetId,
                    resolvedSql.sqlDatasetId,
                ),
                    sqlSchemaSql: firstNonBlank(
                    (effectiveSavedForBind as any)?.sqlSchemaSql,
                    (effectiveSavedForBind?.workspace as any)?.sqlSchemaSql,
                    resolvedSql.sqlSchemaSql,
                ),
                    sqlSeedSql: firstNonBlank(
                    (effectiveSavedForBind as any)?.sqlSeedSql,
                    (effectiveSavedForBind?.workspace as any)?.sqlSeedSql,
                    resolvedSql.sqlSeedSql,
                ),
                    starterHash:
                    typeof effectiveSavedForBind?.starterHash === "string"
                        ? effectiveSavedForBind.starterHash
                        : currentStarterHash,
                    sqlInitialTableSnapshots:
                    (effectiveSavedForBind as any)?.sqlInitialTableSnapshots ??
                    (effectiveSavedForBind?.workspace as any)?.sqlInitialTableSnapshots ??
                    resolvedSql.sqlInitialTableSnapshots,
            };

            const nextSnapIsLearnerOwned = Boolean(
                effectiveSavedIsUserWork ||
                args2.userEdited === true ||
                args2.workspaceOrigin === "user" ||
                args2.workspaceOrigin === "saved"
            );
            /**
             * Keep the runtime exercise store aligned with the actual Tools
             * binding. This is what Check/Reveal/progress-save read from. Starter
             * snapshots may establish a missing exercise contract, but they must
             * not downgrade an existing runtime exercise or saved learner work.
             */
            const existingRuntimeDiffersFromBindContract =
                existingExerciseForBind?.language !== nextSnap.lang ||
                existingExerciseForBindWorkspaceKey !== nextSnap.workspaceKey ||
                existingExerciseForBindCode !== nextSnap.code;
            const existingRuntimeIdeConfigDiffers =
                ideConfigKey(existingExerciseForBind?.ideConfig ?? null) !==
                ideConfigKey(args2.ideConfig ?? null);
            const shouldPatchRuntimeForBind =
                nextSnapIsLearnerOwned ||
                !existingExerciseForBind ||
                (!existingExerciseForBindIsUserWork &&
                    (existingRuntimeDiffersFromBindContract || existingRuntimeIdeConfigDiffers));

            if (shouldPatchRuntimeForBind) {
                patchExercise(targetKey, {
                    language: nextSnap.lang,
                    lang: nextSnap.lang,
                    workspace: nextSnap.workspace ?? undefined,
                    codeWorkspace: nextSnap.workspace ?? undefined,
                    ideWorkspace: nextSnap.workspace ?? undefined,
                    code: nextSnap.code,
                    source: nextSnap.code,
                    stdin: nextSnap.stdin,
                    codeStdin: nextSnap.stdin,
                    starterHash: nextSnap.starterHash,
                    workspaceOrigin: nextSnapIsLearnerOwned ? "saved" : "starter",
                    userEdited: nextSnapIsLearnerOwned,
                    ideConfig: args2.ideConfig ?? null,
                    sqlDialect: nextSnap.sqlDialect,
                    sqlDatasetId: nextSnap.sqlDatasetId,
                    sqlSchemaSql: nextSnap.sqlSchemaSql,
                    sqlSeedSql: nextSnap.sqlSeedSql,
                    sqlInitialTableSnapshots: nextSnap.sqlInitialTableSnapshots,
                    updatedAt: Date.now(),
                } as any);
            }

            if (
                effectiveSavedForBind &&
                (nextSnap.code !== args2.code ||
                    nextSnap.stdin !== (args2.stdin ?? "") ||
                    nextSnap.lang !== args2.lang)
            ) {
                args2.onPatch({
                    codeLang: nextSnap.lang,
                    language: nextSnap.lang,
                    lang: nextSnap.lang,
                    code: nextSnap.code,
                    source: nextSnap.code,
                    codeStdin: nextSnap.stdin,
                    stdin: nextSnap.stdin,
                    updateOrigin: "sync",
                });
            }

            const nextBindKey = `${nextIdentity}::${inputId}::${targetKey}::${snapKey(nextSnap)}::${ideConfigKey(args2.ideConfig)}`;

            if (lastBindKeyRef.current === nextBindKey) {
                boundRef.current = { id: inputId, exerciseKey: targetKey, onPatch: args2.onPatch };
                boundContextRef.current = bindingContext;
                setToolIdeConfigIfChanged(args2.ideConfig ?? null);
                if (hydratedToolIdentity !== nextIdentity) setHydratedToolIdentity(nextIdentity);
                return;
            }

            lastBindKeyRef.current = nextBindKey;
            boundRef.current = { id: inputId, exerciseKey: targetKey, onPatch: args2.onPatch };
            boundContextRef.current = bindingContext;
            setBoundId((prev) => (prev === targetKey ? prev : targetKey));
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
            if (nextSnapIsLearnerOwned && snapshotOverridesSaved) {
                void commitToolToProgress(nextSnap);
            }
        },
        [
            prime,
            commitToolToProgress,
            defaultSqlDialect,
            setToolIdeConfigIfChanged,
            bindingContext,
            viewTid,
            versionStr,
            hydratedToolIdentity,
            progress,
            exercises,
            patchExercise,
            flushLatest,
        ],
    );

    const unbindCodeInput = useCallback(() => {
        if (progressHydrated) {
            void commitToolToProgress(latestSnapRef.current);
        }
        cancel();
        clearBoundState();
        setToolIdeConfigIfChanged(null);
    }, [
        cancel,
        clearBoundState,
        setToolIdeConfigIfChanged,
        progressHydrated,
        commitToolToProgress,
    ]);

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
        latestSnapRef.current = {
            ...latestSnapRef.current,
            topicId: viewTid,
            toolKey: effectiveToolKey,
            lang: l,
        };
        setToolLang0((prev) => (prev === l ? prev : l));

        const b = boundRef.current;
        if (b && effectiveBoundId && boundContextRef.current === bindingContext) {
            boundDirtyRef.current = true;
            const latest = latestSnapRef.current;

            reviewSaveDebug("bound exercise tool patch", {
                boundId: b.id,
                exerciseKey: b.exerciseKey,
                effectiveBoundId,
                codeLength: String(latest.code ?? "").length,
                stdinLength: String(latest.stdin ?? "").length,
                workspace: summarizeWorkspaceForSave(latest.workspace),
            });

            b.onPatch({
                codeLang: l,
                submitted: false,
                feedbackDismissed: true,
dismissFeedbackOnEdit: true,
                updateOrigin: "user",
            });
        }
    }, [effectiveBoundId, bindingContext, viewTid, effectiveToolKey]);

    const setToolCode = useCallback((c: string) => {
        const currentWorkspace = latestSnapRef.current.workspace ?? null;
        const nextWorkspace = workspaceWithEntryCode(currentWorkspace, c);
        const nextWorkspaceKey = workspaceKeyOf(nextWorkspace);

        latestSnapRef.current = {
            ...latestSnapRef.current,
            topicId: viewTid,
            toolKey: effectiveToolKey,
            code: c,
            workspace: nextWorkspace,
            workspaceKey: nextWorkspaceKey,
        };

        setToolCode0((prev) => (prev === c ? prev : c));
        if (toolWorkspaceKeyRef.current !== nextWorkspaceKey) {
            toolWorkspaceKeyRef.current = nextWorkspaceKey;
            setToolWorkspace0(nextWorkspace);
            setToolWorkspaceKey(nextWorkspaceKey);
        }

        if (isCardToolKey(effectiveToolKey)) {
            const cardKey = cardStateKeyFromToolKey(effectiveToolKey);
            const cardId = cardIdFromToolKey(effectiveToolKey);

            patchCard(cardKey, {
                topicId: viewTid,
                cardId,
                toolKey: effectiveToolKey,
                toolWorkspace: nextWorkspace,
                toolCode: c,
                toolStdin: latestSnapRef.current.stdin,
                toolLang: latestSnapRef.current.lang,
                workspaceStatus: nextWorkspace ? "ready" : "pending",
                workspaceSeedMode: nextWorkspace ? "restored" : undefined,
                    workspaceOrigin: "user",
                    userEdited: true,
            } as any);
        }

        const b = boundRef.current;
        if (b && effectiveBoundId && boundContextRef.current === bindingContext) {
            boundDirtyRef.current = true;
            b.onPatch({
                ...(nextWorkspace
                    ? {
                        workspace: nextWorkspace,
                            codeWorkspace: nextWorkspace,
                            ideWorkspace: nextWorkspace,
                    }
                    : {}),
                code: c,
                submitted: false,
                feedbackDismissed: true,
dismissFeedbackOnEdit: true,
                updateOrigin: "user",
                    userEdited: true,
                    workspaceOrigin: "user",
            });
        }
    }, [effectiveBoundId, bindingContext, viewTid, effectiveToolKey, patchCard]);

    const setToolStdin = useCallback((s: string) => {
        const currentWorkspace = latestSnapRef.current.workspace ?? null;
        const nextWorkspace =
            currentWorkspace && currentWorkspace.version === 2
                ? { ...currentWorkspace, stdin: s }
                : currentWorkspace;
        const nextWorkspaceKey = workspaceKeyOf(nextWorkspace);

        latestSnapRef.current = {
            ...latestSnapRef.current,
            topicId: viewTid,
            toolKey: effectiveToolKey,
            stdin: s,
            workspace: nextWorkspace,
            workspaceKey: nextWorkspaceKey,
        };

        setToolStdin0((prev) => (prev === s ? prev : s));
        if (toolWorkspaceKeyRef.current !== nextWorkspaceKey) {
            toolWorkspaceKeyRef.current = nextWorkspaceKey;
            setToolWorkspace0(nextWorkspace);
            setToolWorkspaceKey(nextWorkspaceKey);
        }

        if (isCardToolKey(effectiveToolKey)) {
            const cardKey = cardStateKeyFromToolKey(effectiveToolKey);
            const cardId = cardIdFromToolKey(effectiveToolKey);

            patchCard(cardKey, {
                topicId: viewTid,
                cardId,
                toolKey: effectiveToolKey,
                toolWorkspace: nextWorkspace,
                toolCode: latestSnapRef.current.code,
                toolStdin: s,
                toolLang: latestSnapRef.current.lang,
                workspaceStatus: nextWorkspace ? "ready" : "pending",
                workspaceSeedMode: nextWorkspace ? "restored" : undefined,
                    workspaceOrigin: "user",
                    userEdited: true,
            } as any);
        }

        const b = boundRef.current;
        if (b && effectiveBoundId && boundContextRef.current === bindingContext) {
            boundDirtyRef.current = true;
            b.onPatch({
                ...(nextWorkspace
                    ? {
                        workspace: nextWorkspace,
                            codeWorkspace: nextWorkspace,
                            ideWorkspace: nextWorkspace,
                    }
                    : {}),
                codeStdin: s,
                stdin: s,
                submitted: false,
                feedbackDismissed: true,
dismissFeedbackOnEdit: true,
                updateOrigin: "user",
                    userEdited: true,
                    workspaceOrigin: "user",
            });
        }
    }, [effectiveBoundId, bindingContext, viewTid, effectiveToolKey, patchCard]);

    const setToolWorkspace = useCallback((workspace: WorkspaceStateV2 | null) => {
        const nextWorkspaceKey = workspaceKeyOf(workspace);
        const workspaceCode = deriveEntryCode(workspace);
        const workspaceStdin =
            typeof workspace?.stdin === "string"
                ? workspace.stdin
                : latestSnapRef.current.stdin;

        const nextSnap = {
            ...latestSnapRef.current,
            topicId: viewTid,
            toolKey: effectiveToolKey,
            code: workspaceCode || latestSnapRef.current.code,
            stdin: workspaceStdin,
            workspace,
            workspaceKey: nextWorkspaceKey,
        };

        latestSnapRef.current = nextSnap;

        setToolCode0((prev) => (prev === nextSnap.code ? prev : nextSnap.code));
        setToolStdin0((prev) => (prev === nextSnap.stdin ? prev : nextSnap.stdin));

        const workspaceChanged = toolWorkspaceKeyRef.current !== nextWorkspaceKey;

        if (workspaceChanged) {
            toolWorkspaceKeyRef.current = nextWorkspaceKey;
            setToolWorkspace0(workspace);
            setToolWorkspaceKey(nextWorkspaceKey);
        }

        /**
         * Critical:
         * Workspace edits from FullIDE must be written into progress.
         * Otherwise navigation works in-memory, but refresh restores old DB state.
         */
        if (isCardToolKey(effectiveToolKey)) {
            const cardKey = cardStateKeyFromToolKey(effectiveToolKey);
            const cardId = cardIdFromToolKey(effectiveToolKey);
            const existingCard = useReviewRuntimeStore.getState().cards?.[cardKey] ?? null;

            const cardAlreadyMatches = Boolean(
                existingCard &&
                    workspaceKeyOf(existingCard.toolWorkspace ?? null) === nextWorkspaceKey &&
                    String(existingCard.toolCode ?? "") === String(nextSnap.code ?? "") &&
                    String(existingCard.toolStdin ?? "") === String(nextSnap.stdin ?? "") &&
                    String(existingCard.toolLang ?? "") === String(nextSnap.lang ?? ""),
            );

            if (!cardAlreadyMatches) {
                reviewSaveDebug("card tool editor changed", {
                    topicId: viewTid,
                    cardId,
                    cardKey,
                    effectiveToolKey,
                    codeLength: String(nextSnap.code ?? "").length,
                    stdinLength: String(nextSnap.stdin ?? "").length,
                    workspace: summarizeWorkspaceForSave(workspace),
                });

                patchCard(cardKey, {
                    topicId: viewTid,
                    cardId,
                    toolKey: effectiveToolKey,
                    toolWorkspace: workspace,
                    toolCode: nextSnap.code,
                    toolStdin: nextSnap.stdin,
                    toolLang: nextSnap.lang,
                    workspaceStatus: workspace ? "ready" : "pending",
                    workspaceSeedMode: workspace ? "restored" : undefined,
                        workspaceOrigin: "user",
                        userEdited: true,
                } as any);
            }
        }

        if (progressHydrated) {
            prime(nextSnap);
            void commitToolToProgress(nextSnap);
        }

        const b = boundRef.current;
        if (b && effectiveBoundId && boundContextRef.current === bindingContext) {
            boundDirtyRef.current = true;
            b.onPatch({
                workspace,
                    codeWorkspace: workspace,
                    ideWorkspace: workspace,
                code: nextSnap.code,
                codeStdin: nextSnap.stdin,
                stdin: nextSnap.stdin,
                submitted: false,
                feedbackDismissed: true,
dismissFeedbackOnEdit: true,
                updateOrigin: "user",
                    userEdited: true,
                    workspaceOrigin: "user",
            });
        }
    }, [
        bindingContext,
        commitToolToProgress,
        patchCard,
        effectiveBoundId,
        effectiveToolKey,
        prime,
        progressHydrated,
        viewTid,
    ]);

    const setToolSqlDialect = useCallback((d: SqlDialect) => {
        latestSnapRef.current = { ...latestSnapRef.current, sqlDialect: d };
        setToolSqlDialect0((prev) => (prev === d ? prev : d));

        const b = boundRef.current;
        if (b && effectiveBoundId && boundContextRef.current === bindingContext) {
            boundDirtyRef.current = true;
            b.onPatch({
                codeSqlDialect: d,
                submitted: false,
                feedbackDismissed: true,
dismissFeedbackOnEdit: true,
                updateOrigin: "user",
            });
        }
    }, [effectiveBoundId, bindingContext]);

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
        boundId: effectiveBoundId,
        isBound,
        bindCodeInput,
        unbindCodeInput,
        toolHydrated: displayHydrated,

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
