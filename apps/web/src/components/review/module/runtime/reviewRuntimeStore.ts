import {create} from "zustand";
import type {WorkspaceStateV2} from "@/components/ide/types";
import type {LooseManifestRecord} from "./reviewTargetRegistry";
import type {
    CardRuntimeState,
    EditorRuntimeState,
    ExerciseRuntimeState,
    ReviewRuntimeState,
    ReviewRuntimeStore,
    UnknownRecord,
    WorkspaceOrigin,
} from "./reviewRuntimeTypes";
import {getCardStateKey} from "./exerciseKeys";
import {resolveExerciseWorkspace} from "./exerciseWorkspaceResolver";
import type { ReviewTargetEntry } from "./reviewTargetRegistry";
import { resolveWorkspaceForTarget } from "./resolveWorkspaceForTarget";
import {resolveCourseLanguage, resolveCourseSqlRunnerConfig} from "./courseProfiles";
import {resolveDeterministicEditorSource, type ReviewDeterministicEditorSource} from "./deterministicEditorSource";
import {resolveSketchState} from "./sketchResolver";
import {reviewDebug, summarizeWorkspace} from "./reviewDebug";
import {exerciseDebug, summarizeExercisePatch, summarizeExerciseWorkspace} from "./exerciseDebug";
import {reviewSaveDebug, summarizeWorkspaceForSave} from "./reviewSaveDebug";
import {languagesCompatible} from "@/components/review/module/utils";
import {normalizeWorkspaceLanguage} from "./workspaceCodeSource";
import {
    hasStarterIntentValue,
    workspaceHasUsableStarterContent
} from "@/components/review/module/runtime/starterContent";

type InternalStore = ReviewRuntimeStore & {
    _flushToolSnapshotCb: (() => void) | null;
};

type RuntimeManifestRecord = LooseManifestRecord;
type RuntimeSavedExerciseRecord = Partial<ExerciseRuntimeState> & UnknownRecord;

function isWorkspace(value: unknown): value is WorkspaceStateV2 {
    return (
        !!value &&
        typeof value === "object" &&
        (value as any).version === 2 &&
        Array.isArray((value as any).nodes)
    );
}

function asRecord(value: unknown): UnknownRecord | null {
    return typeof value === "object" && value !== null
        ? (value as UnknownRecord)
        : null;
}

function asManifestRecord(value: unknown): RuntimeManifestRecord | null {
    return asRecord(value) as RuntimeManifestRecord | null;
}

function asSavedExerciseRecord(value: unknown): RuntimeSavedExerciseRecord | null {
    return asRecord(value) as RuntimeSavedExerciseRecord | null;
}

function asStringRecord(value: unknown): Record<string, string> | undefined {
    if (!value || typeof value !== "object") return undefined;

    const entries = Object.entries(value);
    if (entries.some(([, entry]) => typeof entry !== "string")) {
        return undefined;
    }

    return Object.fromEntries(entries) as Record<string, string>;
}

function isSavedSketchState(value: unknown): value is import("@/components/sketches/subjects/types").SavedSketchState {
    return !!value && typeof value === "object" && "data" in value;
}

function deriveCodeFromWorkspace(workspace: WorkspaceStateV2 | null | undefined) {
    if (!workspace) return "";

    const preferredEntryId = workspace.entryFileId || workspace.activeFileId;
    const fallbackFile = workspace.nodes.find((node) => node.kind === "file");
    const entryNode = workspace.nodes.find(
        (node) => node.kind === "file" && node.id === preferredEntryId,
    ) ?? fallbackFile;

    return entryNode && entryNode.kind === "file"
        ? String(entryNode.content ?? "")
        : "";
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

    return changed ? {...workspace, nodes} : workspace;
}




function mergeManifestFixturesIntoSavedWorkspace(args: {
    savedWorkspace: WorkspaceStateV2;
    language: string;
    manifest: RuntimeManifestRecord | null;
    entry?: import("./reviewTargetRegistry").ReviewTargetEntry | null;
}): WorkspaceStateV2 {
    if (!args.manifest && !args.entry) {
        return args.savedWorkspace;
    }

    return resolveExerciseWorkspace({
        language: args.language,
        manifest: args.manifest ?? args.entry?.item ?? {},
        entry: args.entry,
        saved: args.savedWorkspace,
    });
}
function workspaceFileCount(workspace: WorkspaceStateV2 | null | undefined) {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return 0;
    }
    return workspace.nodes.filter((node: any) => node?.kind === "file").length;
}

function workspaceStructureKey(workspace: WorkspaceStateV2 | null | undefined) {
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

    const folders = Array.from(folderPathById.values()).sort((a, b) =>
        a.localeCompare(b),
    );

    const files = (workspace.nodes as any[])
        .filter((node) => node?.kind === "file")
        .map((node) => filePath(node))
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
        activePath: activeNode ? filePath(activeNode) : null,
        entryPath: entryNode ? filePath(entryNode) : null,
        folders,
        files,
    });
}

function shouldPreserveSavedWorkspace(
    saved: WorkspaceStateV2 | null | undefined,
    starter: WorkspaceStateV2 | null | undefined,
) {
    if (!saved || !workspaceHasUsableFile(saved)) return false;

    const savedKey = workspaceContentKey(saved);
    const starterKey = workspaceContentKey(starter);
    if (savedKey === starterKey) return true;

    const savedStructure = workspaceStructureKey(saved);
    const starterStructure = workspaceStructureKey(starter);
    if (savedStructure !== starterStructure) return true;

    const savedStdin = typeof saved.stdin === "string" ? saved.stdin.trim() : "";
    const starterStdin = typeof starter?.stdin === "string" ? starter.stdin.trim() : "";
    if (savedStdin && savedStdin !== starterStdin) return true;

    // Legacy saves may not have userEdited/workspaceOrigin yet. If the saved
    // workspace differs only by file contents, preserve it instead of silently
    // replacing a learner's small edit with the manifest starter.
    return savedKey !== starterKey;
}

function parseRuntimeOwnerKey(ownerKey: string) {
    const parts = String(ownerKey ?? "").split(":").filter(Boolean);
    return {
        subjectSlug: parts[0] ?? "unknown",
        moduleSlug: parts[1] ?? "unknown",
        sectionSlug: parts[2] ?? undefined,
        topicId: parts[3] ?? "unknown",
        cardId: parts[4] ?? "general",
        exerciseId: parts.slice(5).join(":") || parts[parts.length - 1] || ownerKey,
    };
}

function workspaceContentKey(workspace: WorkspaceStateV2 | null | undefined) {
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

    const folders = (workspace.nodes as any[])
        .filter((node) => node?.kind === "folder")
        .map((node) => ({
            path: filePath(node),
        }))
        .filter((entry) => entry.path)
        .sort((a, b) => a.path.localeCompare(b.path));

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
function terminalEvidenceContentKey(value: unknown) {
    const record = asRecord(value);
    if (!record) return "null";

    const commands = Array.isArray(record.commands)
        ? record.commands.map((entry) => String(entry ?? "")).filter(Boolean)
        : [];

    return JSON.stringify({
        cwd: typeof record.cwd === "string" ? record.cwd : "",
        commands,
        outputText:
            typeof record.outputText === "string" ? record.outputText : "",
    });
}

function stableContentKey(value: unknown): string {
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

function ideConfigContentKey(value: unknown): string {
    return stableContentKey(value ?? null);
}


function workspacePathForNode(
    nodes: WorkspaceStateV2["nodes"],
    nodeId: string | null | undefined,
): string {
    if (!nodeId) return "";

    const byId = new Map(nodes.map((node) => [String(node.id ?? ""), node] as const));
    const parts: string[] = [];
    let currentId: string | null = String(nodeId);

    while (currentId) {
        const node = byId.get(currentId);
        if (!node) break;
        const name = String((node as any).name ?? "");
        if (name) parts.unshift(name);
        currentId = (node as any).parentId == null ? null : String((node as any).parentId);
    }

    return parts.join("/");
}

function ensureWorkspaceFolderForRuntime(args: {
    workspace: WorkspaceStateV2;
    folderPath: string;
}): string | null {
    const parts = String(args.folderPath ?? "").split("/").filter(Boolean);
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

        const folderId = `folder:${currentPath}`;
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

function mergeMissingFilesFromWorkspace(
    baseWorkspace: WorkspaceStateV2 | null | undefined,
    sourceWorkspace: WorkspaceStateV2 | null | undefined,
): WorkspaceStateV2 | null {
    if (!baseWorkspace || baseWorkspace.version !== 2) {
        return baseWorkspace ?? sourceWorkspace ?? null;
    }

    if (!sourceWorkspace || sourceWorkspace.version !== 2) {
        return baseWorkspace;
    }

    const merged: WorkspaceStateV2 = {
        ...baseWorkspace,
        nodes: Array.isArray(baseWorkspace.nodes)
            ? baseWorkspace.nodes.map((node: any) => ({ ...node }))
            : [],
        openTabs: [...(baseWorkspace.openTabs ?? [])],
        expanded: [...(baseWorkspace.expanded ?? [])],
    };

    const existingFolderPaths = new Set(
        merged.nodes
            .filter((node: any) => node?.kind === "folder")
            .map((node: any) => workspacePathForNode(merged.nodes, String(node.id ?? "")))
            .filter(Boolean),
    );

    for (const node of sourceWorkspace.nodes as any[]) {
        if (node?.kind !== "folder") continue;

        const path = workspacePathForNode(sourceWorkspace.nodes, String(node.id ?? ""));
        if (!path || existingFolderPaths.has(path)) continue;

        ensureWorkspaceFolderForRuntime({
            workspace: merged,
            folderPath: path,
        });

        existingFolderPaths.add(path);
    }

    const existingPaths = new Set(
        merged.nodes
            .filter((node: any) => node?.kind === "file")
            .map((node: any) => workspacePathForNode(merged.nodes, String(node.id ?? "")))
            .filter(Boolean),
    );

    for (const node of sourceWorkspace.nodes as any[]) {
        if (node?.kind !== "file") continue;

        const path = workspacePathForNode(sourceWorkspace.nodes, String(node.id ?? ""));
        if (!path || existingPaths.has(path)) continue;

        const segments = path.split("/");
        const name = segments.pop() || String(node.name ?? "file.txt");
        const parentId = ensureWorkspaceFolderForRuntime({
            workspace: merged,
            folderPath: segments.join("/"),
        });

        merged.nodes.push({
            ...node,
            id: `file:${path}`,
            name,
            parentId,
            createdAt: node.createdAt ?? 0,
            updatedAt: node.updatedAt ?? 0,
        } as any);

        existingPaths.add(path);
    }

    return merged;
}


function normalizeWorkspacePatch(args: {
    workspace: WorkspaceStateV2;
    stdin?: string;
}) {
    const stdin =
        typeof args.stdin === "string"
            ? args.stdin
            : typeof args.workspace.stdin === "string"
                ? args.workspace.stdin
                : "";

    const workspace = {
        ...args.workspace,
        stdin,
    };

    return {
        workspace,
        codeWorkspace: workspace,
        ideWorkspace: workspace,
        stdin,
        codeStdin: stdin,
        code: deriveCodeFromWorkspace(workspace),
    };
}

function getPatchWorkspace(
    patch: UnknownRecord,
    existing?: ExerciseRuntimeState,
) {
    if (isWorkspace(patch.workspace)) return patch.workspace;
    if (isWorkspace(patch.codeWorkspace)) return patch.codeWorkspace;
    if (isWorkspace(patch.ideWorkspace)) return patch.ideWorkspace;
    return existing?.workspace ?? null;
}
function isUserOwnedRuntimePatch(value: any) {
    return (
        value?.userEdited === true ||
        value?.workspaceOrigin === "user" ||
        value?.workspaceOrigin === "saved"
    );
}

function isCorrectRuntimePatch(value: any) {
    return value?.result?.ok === true || value?.correct === true;
}

function getPatchCodeForPreserveCheck(
    patch: UnknownRecord,
    workspace: WorkspaceStateV2 | null | undefined,
) {
    if (typeof patch.code === "string" && patch.code.trim()) {
        return patch.code;
    }

    if (typeof patch.source === "string" && patch.source.trim()) {
        return patch.source;
    }

    return deriveCodeFromWorkspace(workspace);
}

function isExplicitIncomingUserEdit(value: any) {
    /**
     * For incoming patches, "saved" is not enough to prove learner ownership.
     *
     * Real review progress reloads can send workspaceOrigin: "saved" while
     * carrying a stale/starter workspace. Only an active user edit should be
     * allowed to replace an existing user workspace when the code differs.
     */
    return value?.userEdited === true || value?.workspaceOrigin === "user";
}

function shouldPreserveExistingUserWorkspace(args: {
    existing: ExerciseRuntimeState | undefined;
    incomingPatch: UnknownRecord;
    incomingWorkspace: WorkspaceStateV2 | null | undefined;
    patchCarriesWorkspaceOrCode: boolean;
}) {
    const { existing, incomingPatch, incomingWorkspace, patchCarriesWorkspaceOrCode } = args;

    if (!existing) return false;
    if (!patchCarriesWorkspaceOrCode) return false;

    const existingIsUserOwned = isUserOwnedRuntimePatch(existing);
    const incomingIsExplicitUserEdit = isExplicitIncomingUserEdit(incomingPatch);

    /**
     * Existing learner/saved work should only be replaceable by a new explicit
     * learner edit. Do not let progress/restore/saved starter snapshots replace it.
     */
    if (!existingIsUserOwned || incomingIsExplicitUserEdit) return false;

    const existingWorkspace =
        existing.workspace ??
        existing.codeWorkspace ??
        existing.ideWorkspace ??
        null;

    const existingCode = String(
        existing.code ??
        existing.source ??
        deriveCodeFromWorkspace(existingWorkspace) ??
        "",
    );

    const incomingCode = String(
        getPatchCodeForPreserveCheck(incomingPatch, incomingWorkspace) ?? "",
    );

    if (!existingCode.trim()) return false;
    if (!incomingCode.trim()) return false;

    /**
     * If the incoming non-explicit-user patch carries different code, preserve
     * the existing learner workspace. This catches starter/progress rehydration
     * after correct answer + next/back navigation.
     */
    if (incomingCode === existingCode) return false;

    return true;
}

function preserveExistingUserWorkspacePatch(args: {
    existing: ExerciseRuntimeState;
    incomingPatch: UnknownRecord;
}) {

    const {existing,incomingPatch }= args;
    const existingWorkspace =
        existing.workspace ??
        existing.codeWorkspace ??
        existing.ideWorkspace ??
        null;

    const existingCode = String(
        existing.code ??
        existing.source ??
        deriveCodeFromWorkspace(existingWorkspace) ??
        "",
    );

    return {
        ...incomingPatch,

        workspace: existingWorkspace,
        codeWorkspace: existing.codeWorkspace ?? existingWorkspace,
        ideWorkspace: existing.ideWorkspace ?? existingWorkspace,

        code: existingCode,
        source: existingCode,
        stdin: existing.stdin ?? existing.codeStdin ?? "",
        codeStdin: existing.codeStdin ?? existing.stdin ?? "",

        language: existing.language ?? existing.lang ?? incomingPatch.language,
        lang: existing.lang ?? existing.language ?? incomingPatch.lang,

        userEdited: true,
        workspaceOrigin: existing.workspaceOrigin === "saved" ? "saved" : "user",

        result: incomingPatch.result ?? existing.result,
    } as UnknownRecord;
}
function getFinalExerciseIdFromKey(key: string) {
    const parts = String(key ?? "").split(":").filter(Boolean);
    return parts[parts.length - 1] || key;
}


function normalizeLookupToken(value: unknown) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/_/g, "-");
}

function keyContainsToken(key: string, token: unknown) {
    const normalizedKey = normalizeLookupToken(key);
    const normalizedToken = normalizeLookupToken(token);
    return Boolean(normalizedToken && normalizedKey.includes(normalizedToken));
}

function keyContainsAnyToken(key: string, tokens: unknown[]) {
    return tokens.some((token) => keyContainsToken(key, token));
}

function extractRouteLikeTargetSlug(key: string) {
    const raw = String(key ?? "");

    const stepMatch = raw.match(/(?:^|[|:])steps=([^|:]+)/);
    if (stepMatch?.[1]) return stepMatch[1];

    const quizCardMatch = raw.match(/(?:^|[|:])quizCard=([^|:]+)/);
    if (quizCardMatch?.[1]) return quizCardMatch[1];

    const cardMatch = raw.match(/(?:^|[|:])card=([^|:]+)/);
    if (cardMatch?.[1]) return cardMatch[1];

    const parts = raw.split(":").filter(Boolean);
    if (parts.length >= 2 && parts[parts.length - 1] === "general") {
        return parts[parts.length - 2];
    }

    return parts[parts.length - 1] ?? raw;
}

function findTargetRegistryEntry(
    registry: import("./reviewTargetRegistry").ReviewTargetRegistry | null | undefined,
    key: string,
    hints?: {
        topicId?: string | null;
        topicSlug?: string | null;
        sectionSlug?: string | null;
        cardId?: string | null;
        targetKind?: string | null;
    },
): import("./reviewTargetRegistry").ReviewTargetEntry | null {
    if (!registry) return null;

    const direct = registry.byKey[key];
    if (direct) return direct;

    const normalizedKey = normalizeLookupToken(key);
    const routeTargetSlug = extractRouteLikeTargetSlug(key);

    let best:
        | {
        entry: import("./reviewTargetRegistry").ReviewTargetEntry;
        score: number;
        reason: string;
    }
        | null = null;

    for (const entry of Object.values(registry.byKey)) {
        let score = 0;
        const reasons: string[] = [];

        if (normalizedKey.includes(normalizeLookupToken(entry.targetKey))) {
            score += 100;
            reasons.push("targetKey");
        }

        if (keyContainsToken(key, entry.targetSlug)) {
            score += 40;
            reasons.push("targetSlug");
        }

        if (
            routeTargetSlug &&
            normalizeLookupToken(routeTargetSlug) === normalizeLookupToken(entry.targetSlug)
        ) {
            score += 60;
            reasons.push("routeTargetSlug");
        }

        if (keyContainsToken(key, entry.cardId)) {
            score += 25;
            reasons.push("cardId");
        }

        if (keyContainsAnyToken(key, [entry.topicId, entry.topicSlug])) {
            score += 20;
            reasons.push("topic");
        }

        if (keyContainsToken(key, entry.sectionSlug)) {
            score += 10;
            reasons.push("section");
        }

        if (hints?.topicId && normalizeLookupToken(hints.topicId) === normalizeLookupToken(entry.topicId)) {
            score += 30;
            reasons.push("hintTopicId");
        }

        if (hints?.topicSlug && normalizeLookupToken(hints.topicSlug) === normalizeLookupToken(entry.topicSlug)) {
            score += 30;
            reasons.push("hintTopicSlug");
        }

        if (hints?.sectionSlug && normalizeLookupToken(hints.sectionSlug) === normalizeLookupToken(entry.sectionSlug)) {
            score += 10;
            reasons.push("hintSection");
        }

        if (hints?.cardId && normalizeLookupToken(hints.cardId) === normalizeLookupToken(entry.cardId)) {
            score += 35;
            reasons.push("hintCardId");
        }

        if (hints?.targetKind && normalizeLookupToken(hints.targetKind) === normalizeLookupToken(entry.targetKind)) {
            score += 15;
            reasons.push("hintKind");
        }

        // Need at least a target/card match. Topic-only is too broad.
        const hasTargetMatch =
            reasons.includes("targetKey") ||
            reasons.includes("targetSlug") ||
            reasons.includes("routeTargetSlug") ||
            reasons.includes("cardId") ||
            reasons.includes("hintCardId");

        if (!hasTargetMatch) continue;

        if (!best || score > best.score) {
            best = {entry, score, reason: reasons.join("+")};
        }
    }

    if (best) {
        reviewDebug("starter-files registry.flex-match", {
            key,
            routeTargetSlug,
            matchedTargetKey: best.entry.targetKey,
            matchedTargetSlug: best.entry.targetSlug,
            matchedKind: best.entry.targetKind,
            score: best.score,
            reason: best.reason,
        });
    } else {
        reviewDebug("starter-files registry.no-match", {
            key,
            routeTargetSlug,
            hints,
            registrySize: Object.keys(registry.byKey).length,
            sampleKeys: Object.keys(registry.byKey).slice(0, 8),
        });
    }

    return best?.entry ?? null;
}

function buildRouteExerciseManifestFromEntry(
    registryEntry: ReviewTargetEntry | null | undefined,
): RuntimeManifestRecord | null {
    const baseManifest = asManifestRecord(
        registryEntry?.toolManifest ?? registryEntry?.item ?? null,
    );

    if (!baseManifest) return null;

    const baseWorkspace = asRecord(baseManifest.workspace);
    const baseRecipe = asRecord(baseManifest.recipe);

    return {
        ...baseManifest,

        starterCode:
            registryEntry?.starterCode ??
            baseManifest.starterCode ??
            (typeof baseWorkspace?.starterCode === "string"
                ? baseWorkspace.starterCode
                : undefined) ??
            (typeof baseRecipe?.starterCode === "string"
                ? baseRecipe.starterCode
                : undefined),

        starterFiles:
            registryEntry?.starterFiles ??
            baseManifest.starterFiles ??
            baseWorkspace?.starterFiles ??
            baseRecipe?.starterFiles,

        files:
            baseManifest.files ??
            baseWorkspace?.files,

        initialFiles:
            baseManifest.initialFiles ??
            baseWorkspace?.initialFiles,

        workspaceFiles:
            baseManifest.workspaceFiles ??
            baseWorkspace?.workspaceFiles,

        workspace: baseManifest.workspace ?? null,
        recipe: baseManifest.recipe,
        runtime: baseManifest.runtime,
    } as RuntimeManifestRecord;
}

function runtimePathForNode(nodes: any[], node: any): string {
    if (!node || node.kind !== "file") return "";

    const names: string[] = [String(node.name ?? "")].filter(Boolean);
    let parentId = node.parentId ?? null;

    while (parentId) {
        const parent = nodes.find((candidate) => candidate?.id === parentId);
        if (!parent) break;

        names.unshift(String(parent.name ?? ""));
        parentId = parent.parentId ?? null;
    }

    return names.join("/");
}

function ensureRuntimeFolder(args: {
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

        const folderId = `folder:${currentPath.replace(/\//g, "__")}`;
        const existingIds = new Set(args.workspace.nodes.map((node: any) => String(node?.id ?? "")));

        let uniqueFolderId = folderId;
        let index = 2;

        while (existingIds.has(uniqueFolderId)) {
            uniqueFolderId = `${folderId}:${index}`;
            index += 1;
        }

        args.workspace.nodes.push({
            id: uniqueFolderId,
            kind: "folder",
            name: part,
            parentId,
            createdAt: 0,
            updatedAt: 0,
        } as any);

        if (!args.workspace.expanded.includes(uniqueFolderId as any)) {
            args.workspace.expanded.push(uniqueFolderId as any);
        }

        parentId = uniqueFolderId;
    }

    return parentId;
}

function mergeMissingFilesFromResolvedWorkspace(args: {
    baseWorkspace: WorkspaceStateV2 | null | undefined;
    resolvedWorkspace: WorkspaceStateV2 | null | undefined;
}): WorkspaceStateV2 | null {
    const base = args.baseWorkspace;
    const resolved = args.resolvedWorkspace;

    if (!base || base.version !== 2 || !Array.isArray(base.nodes)) {
        return base ?? resolved ?? null;
    }

    if (!resolved || resolved.version !== 2 || !Array.isArray(resolved.nodes)) {
        return base;
    }

    const baseNodes = base.nodes as any[];
    const resolvedNodes = resolved.nodes as any[];

    const existingPaths = new Set(
        baseNodes
            .filter((node) => node?.kind === "file")
            .map((node) => runtimePathForNode(baseNodes, node))
            .filter(Boolean),
    );

    const missingFiles = resolvedNodes
        .filter((node) => node?.kind === "file")
        .map((node) => ({
            node,
            path: runtimePathForNode(resolvedNodes, node),
        }))
        .filter(({ path }) => path && !existingPaths.has(path));

    if (missingFiles.length === 0) {
        return base;
    }

    const merged: WorkspaceStateV2 = {
        ...base,
        nodes: baseNodes.map((node) => ({ ...node })),
        openTabs: [...(base.openTabs ?? [])],
        expanded: [...(base.expanded ?? [])],
    };

    for (const { node, path } of missingFiles) {
        const parts = path.split("/");
        const name = parts.pop() || String(node.name ?? "file.txt");
        const folderPath = parts.join("/");
        const parentId = ensureRuntimeFolder({
            workspace: merged,
            folderPath,
        });

        const baseId = `file:${path.replace(/\//g, "__")}`;
        const existingIds = new Set(merged.nodes.map((candidate: any) => String(candidate?.id ?? "")));

        let fileId = baseId;
        let index = 2;

        while (existingIds.has(fileId)) {
            fileId = `${baseId}:${index}`;
            index += 1;
        }

        merged.nodes.push({
            ...node,
            id: fileId,
            name,
            parentId,
            createdAt: node.createdAt ?? 0,
            updatedAt: node.updatedAt ?? 0,
        } as any);

        existingPaths.add(path);
    }

    return merged;
}



function filenameForLanguage(language: WorkspaceStateV2["language"]) {
    const lang = String(language ?? "").trim().toLowerCase();

    const extensions: Record<string, string> = {
        python: "py",
        py: "py",
        sql: "sql",
        javascript: "js",
        js: "js",
        typescript: "ts",
        ts: "ts",
        java: "java",
        c: "c",
        cpp: "cpp",
        "c++": "cpp",
        csharp: "cs",
        "c#": "cs",
        cs: "cs",
        go: "go",
        rust: "rs",
        rs: "rs",
        ruby: "rb",
        rb: "rb",
        php: "php",
        swift: "swift",
        kotlin: "kt",
        kt: "kt",
        r: "r",
        bash: "sh",
        shell: "sh",
        sh: "sh",
        html: "html",
        css: "css",
        json: "json",
        plaintext: "txt",
        text: "txt",
    };

    return `main.${extensions[lang] ?? "txt"}`;
}

function emptyWorkspace(language: WorkspaceStateV2["language"]): WorkspaceStateV2 {
    const normalizedLanguage = String(language ?? "python").trim() || "python";
    const now = Date.now();

    return {
        version: 2,
        language: normalizedLanguage as WorkspaceStateV2["language"],
        entryFileId: "main",
        activeFileId: "main",
        nodes: [
            {
                id: "main",
                kind: "file",
                name: filenameForLanguage(
                    normalizedLanguage as WorkspaceStateV2["language"],
                ),
                parentId: null,
                content: "",
                createdAt: now,
                updatedAt: now,
            },
        ],
        stdin: "",
        openTabs: ["main"],
        expanded: [],
        leftPct: 26,
    };
}
function targetHasStarter(
    entryOrManifest: any,
    maybeEntry?: import("./reviewTargetRegistry").ReviewTargetEntry | null,
) {
    const entry =
        maybeEntry ??
        (entryOrManifest &&
        typeof entryOrManifest === "object" &&
        "targetKey" in entryOrManifest
            ? (entryOrManifest as import("./reviewTargetRegistry").ReviewTargetEntry)
            : null);

    const item = maybeEntry ? entryOrManifest : entry?.item ?? entryOrManifest;
    const source = item?.spec ?? item ?? {};
    const workspace = source?.workspace ?? {};
    const recipe = source?.recipe ?? {};

    const isWorkspaceValue = (value: unknown) =>
        !!value &&
        typeof value === "object" &&
        (value as any).version === 2 &&
        Array.isArray((value as any).nodes) &&
        workspaceHasUsableStarterContent(value as WorkspaceStateV2);

    return Boolean(
        isWorkspaceValue(source?.initialWorkspace) ||
        isWorkspaceValue(source?.starterWorkspace) ||
        isWorkspaceValue(entry?.starterWorkspace) ||
        hasStarterIntentValue(entry?.starterFiles) ||
        hasStarterIntentValue(entry?.starterCode) ||
        hasStarterIntentValue(workspace?.starterFiles) ||
        hasStarterIntentValue(workspace?.initialFiles) ||
        hasStarterIntentValue(workspace?.workspaceFiles) ||
        hasStarterIntentValue(workspace?.starterCode) ||
        hasStarterIntentValue(source?.starterFiles) ||
        hasStarterIntentValue(source?.initialFiles) ||
        hasStarterIntentValue(source?.workspaceFiles) ||
        hasStarterIntentValue(source?.starterCode) ||
        hasStarterIntentValue(recipe?.starterFiles) ||
        hasStarterIntentValue(recipe?.initialFiles) ||
        hasStarterIntentValue(recipe?.starterCode)
    );
}
function workspaceHasUsableFile(workspace: WorkspaceStateV2 | null | undefined) {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return false;
    }

    return workspace.nodes.some((node: any) => {
        if (node?.kind !== "file") return false;
        return String(node.content ?? "").trim().length > 0;
    });
}

function workspaceLanguage(workspace: WorkspaceStateV2 | null | undefined) {
    return String((workspace as any)?.language ?? "").trim().toLowerCase();
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


function workspaceHash(workspace: WorkspaceStateV2 | null | undefined) {
    return workspaceContentKey(workspace);
}

function isUserWorkspaceState(value: any) {
    return (
        value?.userEdited === true ||
        value?.workspaceOrigin === "user" ||
        value?.workspaceOrigin === "saved"
    );
}

function shouldUseSavedUserWorkspace(args: {
    savedState: any;
    savedWorkspace: WorkspaceStateV2 | null | undefined;
    starterWorkspace: WorkspaceStateV2 | null | undefined;
    language?: string | null;
}) {
    if (!args.savedWorkspace || !workspaceHasUsableFile(args.savedWorkspace)) {
        return false;
    }

    const expectedLanguage = String(
        args.language ??
        workspaceLanguage(args.starterWorkspace) ??
        "",
    ).trim();

    const savedLanguage = String(
        args.savedState?.language ??
        args.savedState?.lang ??
        workspaceLanguage(args.savedWorkspace) ??
        "",
    ).trim();

    /**
     * Never restore Python into SQL, SQL into Python, etc.
     */
    if (
        expectedLanguage &&
        savedLanguage &&
        !languagesCompatible(savedLanguage, expectedLanguage)
    ) {
        return false;
    }

    const starterHasCode = workspaceHasNonBlankFile(args.starterWorkspace);
    const savedHasCode = workspaceHasNonBlankFile(args.savedWorkspace);

    /**
     * If this exercise has starter code, do not let a blank saved workspace
     * erase it.
     */
    if (starterHasCode && !savedHasCode) {
        return false;
    }

    const currentStarterHash = workspaceHash(args.starterWorkspace);
    const savedStarterHash =
        typeof args.savedState?.starterHash === "string"
            ? args.savedState.starterHash
            : "";

    /**
     * Most important stale-state guard:
     * if the curriculum starter changed, old saved workspace must not override it.
     */
    if (
        savedStarterHash &&
        currentStarterHash &&
        savedStarterHash !== currentStarterHash
    ) {
        return false;
    }

    /**
     * Saved states explicitly marked as starter/empty are not learner work.
     */
    if (
        args.savedState?.workspaceOrigin === "starter" ||
        args.savedState?.workspaceOrigin === "empty" ||
        args.savedState?.userEdited === false
    ) {
        return false;
    }

    /**
     * Only trust real user/saved work after starter hash compatibility is checked.
     */
    if (isUserWorkspaceState(args.savedState)) {
        return true;
    }

    /**
     * If there is a starterHash, and it matched above, this workspace is safe only
     * when it actually differs from the starter.
     */
    if (savedStarterHash) {
        return workspaceHash(args.savedWorkspace) !== savedStarterHash;
    }

    /**
     * Legacy no-hash saves are risky. Only preserve them if the current starter
     * has no useful code. This prevents old bad main.py content from sticking
     * after curriculum updates.
     */
    if (starterHasCode) {
        return false;
    }

    return shouldPreserveSavedWorkspace(args.savedWorkspace, args.starterWorkspace);
}


function starterLoopTrace(label: string, payload: Record<string, any>) {
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
        payload.key ??
        payload.cardKey ??
        payload.exerciseKey ??
        payload.targetKey ??
        payload.workspaceContextKey ??
        "global",
    );

    const fingerprint = JSON.stringify({
        label,
        key,
        workspaceKey: payload.workspaceKey ?? payload.nextWorkspaceKey ?? payload.incomingWorkspaceKey ?? null,
        existingWorkspaceKey: payload.existingWorkspaceKey ?? payload.currentWorkspaceKey ?? null,
        codeLength: payload.codeLength ?? payload.nextCodeLength ?? payload.incomingCodeLength ?? null,
        status: payload.workspaceStatus ?? payload.status ?? null,
        seedMode: payload.workspaceSeedMode ?? payload.seedMode ?? null,
        reason: payload.reason ?? null,
        patched: payload.patched ?? null,
        noop: payload.noop ?? null,
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
        console.warn("[starter-loop] repeated same transition more than 10 times", {
            label,
            key,
            payload,
            hint: "This is likely the loop edge. Compare workspaceKey/currentWorkspaceKey and patched/noop.",
            inspect: "window.__ZOE_STARTER_LOOP__",
        });
    }
}
function stableWorkspaceKey(workspace: any): string {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return "null";
    }

    const files = workspace.nodes
        .filter((node: any) => node?.kind === "file")
        .map((node: any) => ({
            id: String(node.id ?? ""),
            name: String(node.name ?? ""),
            parentId: node.parentId == null ? null : String(node.parentId),
            content: String(node.content ?? ""),
        }))
        .sort((a: any, b: any) => a.id.localeCompare(b.id));

    return JSON.stringify({
        version: workspace.version,
        language: workspace.language ?? null,
        activeFileId: workspace.activeFileId ?? null,
        entryFileId: workspace.entryFileId ?? null,
        stdin: workspace.stdin ?? "",
        files,
    });
}
function resolveCardToolSeed(args: {
    language: string;
    toolManifest?: unknown;
    existing?: CardRuntimeState;
    entry?: import("./reviewTargetRegistry").ReviewTargetEntry | null;
}): {
    workspaceStatus: "pending" | "ready" | "error";
    workspaceSeedMode?: "starter" | "empty" | "restored";
    workspaceOrigin?: WorkspaceOrigin;
    userEdited?: boolean;
    starterHash?: string;
    workspace: WorkspaceStateV2 | null;
    code: string;
    stdin: string;
    lang: WorkspaceStateV2["language"];
    sourceType: string;
} {
    const manifest = asManifestRecord(args.toolManifest ?? args.entry?.item);
    const resolvedLanguage = resolveCourseLanguage({
        language: args.entry?.language ?? args.language,
        target: manifest ?? args.entry?.item ?? null,
    });
    const hasStarter = targetHasStarter(manifest, args.entry);
    const starterWorkspace =
        manifest || args.entry
            ? resolveExerciseWorkspace({
                language: args.entry?.language ?? resolvedLanguage,
                manifest,
                entry: args.entry,
            })
            : null;
    const starterWorkspaceHash = workspaceHash(starterWorkspace);
    const useExistingUserWorkspace = shouldUseSavedUserWorkspace({
        savedState: args.existing,
        savedWorkspace: args.existing?.toolWorkspace,
        starterWorkspace,
        language: args.entry?.language ?? resolvedLanguage,
    });

    if (
        args.existing?.toolWorkspace &&
        (!hasStarter || useExistingUserWorkspace)
    ) {
        const restoredWorkspace = mergeManifestFixturesIntoSavedWorkspace({
            savedWorkspace: args.existing.toolWorkspace,
            language: args.entry?.language ?? resolvedLanguage,
            manifest,
            entry: args.entry,
        });

        reviewDebug("review-runtime source-selected", {
            key: args.entry?.cardKey ?? args.existing?.cardKey ?? null,
            entryFound: !!args.entry,
            targetKind: args.entry?.targetKind ?? "card",
            starterFilesCount: Array.isArray(args.entry?.starterFiles) ? args.entry.starterFiles.length : 0,
            starterCodeLength: typeof args.entry?.starterCode === "string" ? args.entry.starterCode.length : 0,
            hasStarter,
            workspaceFileCount: workspaceFileCount(restoredWorkspace),
            workspaceNonEmpty: workspaceHasUsableFile(restoredWorkspace),
            sourceType: "existing",
        });

        return {
            workspaceStatus: args.existing.workspaceStatus ?? "ready",
            workspaceSeedMode: args.existing.workspaceSeedMode ?? "restored",
            workspaceOrigin: args.existing.workspaceOrigin ?? "saved",
            userEdited: Boolean(args.existing.userEdited ?? isUserWorkspaceState(args.existing)),
            starterHash: args.existing.starterHash ?? starterWorkspaceHash,
            workspace: restoredWorkspace,
            code: deriveCodeFromWorkspace(restoredWorkspace) || args.existing.toolCode || "",
            stdin:
                args.existing.toolStdin ??
                (typeof restoredWorkspace.stdin === "string"
                    ? restoredWorkspace.stdin
                    : ""),
            lang: args.existing.toolLang ?? resolvedLanguage,
            sourceType: "existing",
        };
    }

    if (manifest || args.entry) {
        const workspace =
            starterWorkspace ??
            resolveExerciseWorkspace({
                language: args.entry?.language ?? resolvedLanguage,
                manifest,
                entry: args.entry,
            });

        const seedMode = hasStarter
            ? "starter"
            : "empty";

        const workspaceNonEmpty = workspaceHasUsableFile(workspace);

        reviewDebug("review-runtime source-selected", {
            key: args.entry?.cardKey ?? args.existing?.cardKey ?? null,
            entryFound: !!args.entry,
            targetKind: args.entry?.targetKind ?? "card",
            starterFilesCount: Array.isArray(args.entry?.starterFiles) ? args.entry!.starterFiles!.length : 0,
            starterCodeLength: typeof args.entry?.starterCode === "string" ? args.entry.starterCode.length : 0,
            hasStarter,
            workspaceFileCount: workspaceFileCount(workspace),
            workspaceNonEmpty,
            sourceType: "manifest",
        });

        if (seedMode === "starter" && (!workspace || !workspaceNonEmpty)) {
            console.error("[review-runtime] starter-backed target resolved blank workspace", {
                key: args.entry?.cardKey ?? args.existing?.cardKey ?? null,
                entryTargetKey: args.entry?.targetKey,
                entryTargetSlug: args.entry?.targetSlug,
                starterFiles: args.entry?.starterFiles,
                starterCodeLength: typeof args.entry?.starterCode === "string" ? args.entry.starterCode.length : 0,
                itemWorkspace: args.entry?.item?.workspace ?? manifest?.workspace ?? null,
            });
            return {
                workspaceStatus: "error" as const,
                workspaceSeedMode: "starter" as const,
                workspace: null,
                code: "",
                stdin: "",
                lang: resolvedLanguage,
                sourceType: "starter-error",
            };
        }

        return {
            workspaceStatus: "ready" as const,
            workspaceSeedMode: seedMode as "starter" | "empty",
            workspaceOrigin: (seedMode === "starter" ? "starter" : "empty") as WorkspaceOrigin,
            userEdited: false,
            starterHash: starterWorkspaceHash,
            workspace,
            code: deriveCodeFromWorkspace(workspace),
            stdin: typeof workspace.stdin === "string" ? workspace.stdin : "",
            lang: resolvedLanguage,
            sourceType: seedMode === "starter" ? "starter" : "empty",
        };
    }

    return {
        workspaceStatus: "pending" as const,
        workspaceSeedMode: undefined,
        workspaceOrigin: undefined,
        userEdited: false,
        starterHash: starterWorkspaceHash,
        workspace: null,
        code: "",
        stdin: "",
        lang: resolvedLanguage,
        sourceType: "pending",
    };
}

function resolveEditorRuntimeSeed(args: {
    source: ReviewDeterministicEditorSource;
    existing?: EditorRuntimeState | null;
    existingCard?: CardRuntimeState | null;
    existingExercise?: ExerciseRuntimeState | null;
}): {
    workspaceStatus: "pending" | "ready" | "error";
    workspaceSeedMode: "starter" | "empty" | "restored";
    workspaceOrigin?: WorkspaceOrigin;
    userEdited?: boolean;
    starterHash?: string;
    workspace: WorkspaceStateV2 | null;
    code: string;
    stdin: string;
    language: WorkspaceStateV2["language"];
} {
    const manifest = asManifestRecord(args.source.manifest);
    const resolvedLanguage = resolveCourseLanguage({
        language: args.source.language,
        target: manifest ?? args.source.entry?.item ?? null,
    });
    const starterWorkspace = resolveExerciseWorkspace({
        language: resolvedLanguage,
        manifest,
        entry: args.source.entry,
    });
    const starterWorkspaceHash = workspaceHash(starterWorkspace);
    const useExistingRuntimeWorkspace = shouldUseSavedUserWorkspace({
        savedState: args.existing,
        savedWorkspace: args.existing?.workspace,
        starterWorkspace,
        language: resolvedLanguage,
    });

    if (
        args.existing?.workspace &&
        (
            args.source.workspaceSeedMode !== "starter" ||
            useExistingRuntimeWorkspace
        )
    ) {
        // const restoredWorkspace = mergeManifestFixturesIntoSavedWorkspace({
        //     savedWorkspace: args.existing.workspace,
        //     language: resolvedLanguage,
        //     manifest,
        //     entry: args.source.entry,
        // });
        const restoredWorkspace = mergeMissingFilesFromResolvedWorkspace({
            baseWorkspace: args.existing.workspace,
            resolvedWorkspace: starterWorkspace,
        });
        reviewDebug("review-runtime source-selected", {
            key: args.source.ownerKey,
            entryFound: !!args.source.entry,
            targetKind: args.source.entry?.targetKind ?? args.source.ownerKind,
            starterFilesCount: Array.isArray(args.source.entry?.starterFiles) ? args.source.entry.starterFiles.length : 0,
            starterCodeLength: typeof args.source.entry?.starterCode === "string" ? args.source.entry.starterCode.length : 0,
            hasStarter: args.source.workspaceSeedMode === "starter",
            workspaceFileCount: workspaceFileCount(restoredWorkspace),
            workspaceNonEmpty: workspaceHasUsableFile(restoredWorkspace),
            sourceType: "existing-runtime",
        });



        return {
            workspaceStatus: args.existing.workspaceStatus ?? "ready",
            workspaceSeedMode: args.existing.workspaceSeedMode ?? "restored",
            workspaceOrigin: args.existing.workspaceOrigin ?? "saved",
            userEdited: Boolean(args.existing.userEdited ?? isUserWorkspaceState(args.existing)),
            starterHash: args.existing.starterHash ?? starterWorkspaceHash,
            workspace: restoredWorkspace,
            code:
                args.existing.code ??
                deriveCodeFromWorkspace(restoredWorkspace),
            stdin:
                args.existing.stdin ??
                (typeof restoredWorkspace?.stdin === "string" ? restoredWorkspace.stdin : ""),
            language: args.existing.language ?? resolvedLanguage,
        };
    }

    const legacyWorkspace =
        args.source.ownerKind === "exercise"
            ? args.existingExercise?.workspace ?? null
            : args.existingCard?.toolWorkspace ?? null;
    const legacyState =
        args.source.ownerKind === "exercise"
            ? args.existingExercise
            : args.existingCard;
    const useLegacyWorkspace = shouldUseSavedUserWorkspace({
        savedState: legacyState,
        savedWorkspace: legacyWorkspace,
        starterWorkspace,
        language: resolvedLanguage,
    });

    if (
        legacyWorkspace &&
        (
            args.source.workspaceSeedMode !== "starter" ||
            useLegacyWorkspace
        )
    ) {
        const legacyLanguage = resolveCourseLanguage({
            language:
                (args.source.ownerKind === "exercise"
                    ? args.existingExercise?.language ?? args.existingExercise?.lang
                    : args.existingCard?.toolLang) ?? resolvedLanguage,
            target: manifest ?? args.source.entry?.item ?? null,
        });

        const restoredLegacyWorkspace = mergeManifestFixturesIntoSavedWorkspace({
            savedWorkspace: legacyWorkspace,
            language: legacyLanguage,
            manifest,
            entry: args.source.entry,
        });

        reviewDebug("review-runtime source-selected", {
            key: args.source.ownerKey,
            entryFound: !!args.source.entry,
            targetKind: args.source.entry?.targetKind ?? args.source.ownerKind,
            starterFilesCount: Array.isArray(args.source.entry?.starterFiles) ? args.source.entry.starterFiles.length : 0,
            starterCodeLength: typeof args.source.entry?.starterCode === "string" ? args.source.entry.starterCode.length : 0,
            hasStarter: args.source.workspaceSeedMode === "starter",
            workspaceFileCount: workspaceFileCount(restoredLegacyWorkspace),
            workspaceNonEmpty: workspaceHasUsableFile(restoredLegacyWorkspace),
            sourceType: "legacy-runtime",
        });

        return {
            workspaceStatus: "ready" as const,
            workspaceSeedMode: "restored" as const,
            workspaceOrigin: legacyState?.workspaceOrigin ?? "saved",
            userEdited: Boolean(legacyState?.userEdited ?? isUserWorkspaceState(legacyState)),
            starterHash: legacyState?.starterHash ?? starterWorkspaceHash,
            workspace: restoredLegacyWorkspace,
            code:
                deriveCodeFromWorkspace(restoredLegacyWorkspace) ||
                (args.source.ownerKind === "exercise"
                    ? args.existingExercise?.code
                    : args.existingCard?.toolCode) ||
                "",
            stdin:
                (args.source.ownerKind === "exercise"
                    ? args.existingExercise?.stdin
                    : args.existingCard?.toolStdin) ??
                (typeof restoredLegacyWorkspace.stdin === "string"
                    ? restoredLegacyWorkspace.stdin
                    : ""),
            language: legacyLanguage,
        };
    }

    const workspace = starterWorkspace;
    const workspaceNonEmpty = workspaceHasUsableFile(workspace);

    reviewDebug("review-runtime source-selected", {
        key: args.source.ownerKey,
        entryFound: !!args.source.entry,
        targetKind: args.source.entry?.targetKind ?? args.source.ownerKind,
        starterFilesCount: Array.isArray(args.source.entry?.starterFiles) ? args.source.entry.starterFiles.length : 0,
        starterCodeLength: typeof args.source.entry?.starterCode === "string" ? args.source.entry.starterCode.length : 0,
        hasStarter: args.source.workspaceSeedMode === "starter",
        workspaceFileCount: workspaceFileCount(workspace),
        workspaceNonEmpty,
        sourceType: args.source.workspaceSeedMode === "starter" ? "starter" : "empty",
    });

    if (args.source.workspaceSeedMode === "starter" && !workspaceNonEmpty) {
        console.error("[review-runtime] starter-backed target resolved blank workspace", {
            key: args.source.ownerKey,
            entryTargetKey: args.source.entry?.targetKey,
            entryTargetSlug: args.source.entry?.targetSlug,
            starterFiles: args.source.entry?.starterFiles,
            starterCodeLength: typeof args.source.entry?.starterCode === "string" ? args.source.entry.starterCode.length : 0,
            itemWorkspace: args.source.entry?.item?.workspace ?? manifest?.workspace ?? null,
        });
        return {
            workspaceStatus: "error" as const,
            workspaceSeedMode: "starter" as const,
            workspace: null,
            code: "",
            stdin: "",
            language: resolvedLanguage,
        };
    }

    return {
        workspaceStatus: "ready" as const,
        workspaceSeedMode: args.source.workspaceSeedMode,
        workspaceOrigin: args.source.workspaceSeedMode === "starter" ? "starter" : "empty",
        userEdited: false,
        starterHash: starterWorkspaceHash,
        workspace,
        code: deriveCodeFromWorkspace(workspace),
        stdin: typeof workspace.stdin === "string" ? workspace.stdin : "",
        language: resolvedLanguage,
    };
}

export const useReviewRuntimeStore = create<InternalStore>((set, get) => ({
    subjectSlug: null,
    moduleSlug: null,
    sectionSlug: null,

    activeTopicId: null,
    viewTopicId: null,
    activeCardIndex: 0,
    activeExerciseKey: null,
    boundToolWorkspace: null,

    cards: {},
    exercises: {},
    editorRuntimes: {},

    tool: {
        boundExerciseKey: null,
    },

    persistence: {
        dirty: false,
        pendingExerciseKeys: new Set(),
        pendingCardKeys: new Set(),
    },

    targetRegistry: null,

    _flushToolSnapshotCb: null,

    setTargetRegistry: (registry) => {
        if (get().targetRegistry === registry) return;
        set({targetRegistry: registry});
    },

    setReviewScope: (scope) => {
        set((state) => ({
            subjectSlug:
                typeof scope.subjectSlug !== "undefined"
                    ? scope.subjectSlug
                    : state.subjectSlug,
            moduleSlug:
                typeof scope.moduleSlug !== "undefined"
                    ? scope.moduleSlug
                    : state.moduleSlug,
            sectionSlug:
                typeof scope.sectionSlug !== "undefined"
                    ? scope.sectionSlug
                    : state.sectionSlug,
            activeTopicId:
                typeof scope.activeTopicId !== "undefined"
                    ? scope.activeTopicId
                    : state.activeTopicId,
            viewTopicId:
                typeof scope.viewTopicId !== "undefined"
                    ? scope.viewTopicId
                    : state.viewTopicId,
        }));
    },

    setTopicIds: (activeTopicId, viewTopicId) => {
        set({activeTopicId, viewTopicId});
    },

    ensureExercise: (args) => {
        const exerciseKey = String(args.exerciseKey ?? "").trim();

        if (!exerciseKey) return;

        set((state) => {
            const existing = state.exercises[exerciseKey] ?? null;

            const manifest = asManifestRecord(args.manifest ?? null);
            const saved = asSavedExerciseRecord(args.saved ?? null);

            const resolvedLanguage = resolveCourseLanguage({
                subjectSlug: args.subjectSlug,
                language:
                    manifest?.language ??
                    manifest?.lang ??
                    saved?.language ??
                    saved?.lang ??
                    existing?.language ??
                    existing?.lang ??
                    "python",
                target: manifest,
            });

            const existingIsCorrect = Boolean(
                (existing?.result as any)?.ok === true ||
                (existing as any)?.correct === true ||
                existing?.status === "completed"
            );

            const savedIsCorrect = Boolean(
                (saved?.result as any)?.ok === true ||
                (saved as any)?.correct === true ||
                saved?.status === "completed"
            );

            const resolvedWorkspace = resolveWorkspaceForTarget({
                targetKey: exerciseKey,
                targetKind: "exercise",
                language: resolvedLanguage,
                manifest,
                entry: args.entry ?? null,
                workspaceRequested: true,
                savedCandidates: [
                    existing
                        ? {
                            workspace: existing.workspace ?? existing.codeWorkspace ?? existing.ideWorkspace ?? null,
                            code: existing.code ?? existing.source ?? null,
                            stdin: existing.stdin ?? existing.codeStdin ?? null,
                            language: existing.language ?? existing.lang ?? null,
                            lang: existing.lang ?? existing.language ?? null,
                            userEdited: existing.userEdited === true || existingIsCorrect,
                            workspaceOrigin:
                                existing.workspaceOrigin === "user" ||
                                existing.workspaceOrigin === "saved"
                                    ? existing.workspaceOrigin
                                    : existingIsCorrect
                                        ? "saved"
                                        : existing.workspaceOrigin ?? null,
                            starterHash: existing.starterHash ?? null,
                            updatedAt: existing.updatedAt ?? null,
                        }
                        : null,
                    saved
                        ? {
                            workspace: isWorkspace(saved?.workspace)
                                ? saved.workspace
                                : isWorkspace(saved?.codeWorkspace)
                                    ? saved.codeWorkspace
                                    : isWorkspace(saved?.ideWorkspace)
                                        ? saved.ideWorkspace
                                        : null,
                            code: saved?.code ?? saved?.source ?? null,
                            stdin: saved?.stdin ?? saved?.codeStdin ?? null,
                            language: saved?.language ?? saved?.lang ?? null,
                            lang: saved?.lang ?? saved?.language ?? null,
                            userEdited: saved?.userEdited === true || savedIsCorrect,
                            workspaceOrigin:
                                saved?.workspaceOrigin === "user" ||
                                saved?.workspaceOrigin === "saved"
                                    ? saved.workspaceOrigin
                                    : savedIsCorrect
                                        ? "saved"
                                        : saved?.workspaceOrigin ?? null,
                            starterHash: saved?.starterHash ?? null,
                            updatedAt: saved?.updatedAt ?? null,
                        }
                        : null,
                ].filter(Boolean) as any,
            });

            const starterHash = resolvedWorkspace.starterHash;
            const selectedWorkspace = resolvedWorkspace.workspace;
            const selectedCode = resolvedWorkspace.code;
            const selectedStdin = resolvedWorkspace.stdin;

            const workspaceStatus: ExerciseRuntimeState["workspaceStatus"] =
                selectedWorkspace
                    ? "ready"
                    : manifest
                        ? resolvedWorkspace.source === "none" ? "error" : "ready"
                        : "pending";

            const workspaceOrigin: WorkspaceOrigin =
                resolvedWorkspace.source === "saved"
                    ? (
                        existing?.workspaceOrigin === "user" ||
                        existing?.workspaceOrigin === "saved"
                            ? existing.workspaceOrigin
                            : (saved?.workspaceOrigin as WorkspaceOrigin) ?? "saved"
                    )
                    : resolvedWorkspace.source === "manifest"
                        ? "starter"
                        : resolvedWorkspace.source === "empty"
                            ? "empty"
                            : existing?.workspaceOrigin ?? "saved";

            const userEdited = resolvedWorkspace.source === "saved";

            const workspaceForState =
                selectedWorkspace ??
                emptyWorkspace(resolvedLanguage as WorkspaceStateV2["language"]);

            const codeForState =
                selectedCode ||
                deriveCodeFromWorkspace(workspaceForState) ||
                "";

            const stdinForState =
                selectedStdin ||
                (typeof workspaceForState.stdin === "string" ? workspaceForState.stdin : "");

            const nextExercise: ExerciseRuntimeState = {
                exerciseKey,
                subjectSlug: args.subjectSlug,
                moduleSlug: args.moduleSlug,
                sectionSlug: args.sectionSlug,
                topicId: args.topicId,
                cardId: args.cardId,
                exerciseId: getFinalExerciseIdFromKey(exerciseKey),
                language: resolvedLanguage,
                lang: resolvedLanguage,
                workspace: workspaceForState,
                codeWorkspace: workspaceForState,
                ideWorkspace: workspaceForState,
                code: codeForState,
                source: codeForState,
                stdin: stdinForState,
                codeStdin: stdinForState,
                runner: existing?.runner ?? {},
                answer: existing?.answer ?? { revealed: false },
                sketch: existing?.sketch ?? null,
                status:
                    existing?.status && existing.status !== "not_started"
                        ? existing.status
                        : "in_progress",
                workspaceStatus,
                workspaceOrigin,
                userEdited,
                starterHash,
                ideConfig: (manifest as any)?.ideConfig ?? existing?.ideConfig ?? null,
                manifest: (manifest as Record<string, unknown> | null) ?? existing?.manifest ?? null,
                updatedAt: existing?.updatedAt ?? Date.now(),
            };

            const noMeaningfulChange = Boolean(
                existing &&
                existing.subjectSlug === nextExercise.subjectSlug &&
                existing.moduleSlug === nextExercise.moduleSlug &&
                existing.sectionSlug === nextExercise.sectionSlug &&
                existing.topicId === nextExercise.topicId &&
                existing.cardId === nextExercise.cardId &&
                existing.exerciseId === nextExercise.exerciseId &&
                String(existing.language ?? existing.lang ?? "") ===
                String(nextExercise.language ?? nextExercise.lang ?? "") &&
                String(existing.code ?? "") === String(codeForState ?? "") &&
                String(existing.stdin ?? existing.codeStdin ?? "") === String(stdinForState ?? "") &&
                existing.workspaceStatus === nextExercise.workspaceStatus &&
                existing.workspaceOrigin === nextExercise.workspaceOrigin &&
                Boolean(existing.userEdited) === Boolean(nextExercise.userEdited) &&
                String(existing.starterHash ?? "") ===
                String(nextExercise.starterHash ?? "") &&
                terminalEvidenceContentKey((existing as any)?.terminalEvidence) ===
                terminalEvidenceContentKey((nextExercise as any).terminalEvidence) &&
                ideConfigContentKey(existing?.ideConfig ?? null) ===
                ideConfigContentKey(nextExercise.ideConfig ?? null) &&
                workspaceContentKey(existing.workspace ?? null) ===
                workspaceContentKey(workspaceForState)
            );

            starterLoopTrace("runtime.ensureExercise.compare", {
                key: exerciseKey,
                existingWorkspaceKey: workspaceContentKey(existing?.workspace ?? null),
                nextWorkspaceKey: workspaceContentKey(nextExercise.workspace ?? null),
                existingIdeConfigKey: ideConfigContentKey(existing?.ideConfig ?? null),
                nextIdeConfigKey: ideConfigContentKey(nextExercise.ideConfig ?? null),
                existingCodeLength: String(existing?.code ?? "").length,
                nextCodeLength: String(nextExercise.code ?? "").length,
                existingStatus: existing?.workspaceStatus,
                nextStatus: nextExercise.workspaceStatus,
                existingOrigin: existing?.workspaceOrigin,
                nextOrigin: nextExercise.workspaceOrigin,
                noop: noMeaningfulChange,
            });

            if (noMeaningfulChange) {
                return state;
            }

            starterLoopTrace("runtime.ensureExercise.write", {
                key: exerciseKey,
                workspaceKey: workspaceContentKey(workspaceForState),
                codeLength: String(codeForState).length,
                patched: true,
            });

            return {
                exercises: {
                    ...state.exercises,
                    [exerciseKey]: nextExercise,
                },
            };
        });
    },
    patchExercise: (key, patch) => {
        let didPatch = false;

        set((state) => {
            const existing = state.exercises[key];
            const explicitPatchWorkspace =
                isWorkspace(patch.workspace)
                    ? patch.workspace
                    : isWorkspace(patch.codeWorkspace)
                        ? patch.codeWorkspace
                        : isWorkspace(patch.ideWorkspace)
                            ? patch.ideWorkspace
                            : null;
            const existingLanguageForPatch = String(
                existing?.language ??
                existing?.lang ??
                workspaceLanguage(existing?.workspace) ??
                "",
            ).trim();
            const incomingLanguageForPatch = String(
                patch.language ??
                patch.lang ??
                workspaceLanguage(explicitPatchWorkspace) ??
                "",
            ).trim();
            const patchCarriesWorkspaceOrCode = Boolean(
                explicitPatchWorkspace ||
                typeof patch.code === "string" ||
                typeof patch.source === "string",
            );
            const patchHasIncompatibleWorkspaceOrCode =
                Boolean(existing) &&
                Boolean(existingLanguageForPatch) &&
                patchCarriesWorkspaceOrCode &&
                (
                    incomingLanguageForPatch
                        ? !languagesCompatible(existingLanguageForPatch, incomingLanguageForPatch)
                        : existingLanguageForPatch.toLowerCase() === "sql"
                );

            let effectivePatch = patchHasIncompatibleWorkspaceOrCode
                ? Object.fromEntries(
                    Object.entries(patch).filter(
                        ([patchKey]) =>
                            ![
                                "code",
                                "source",
                                "workspace",
                                "codeWorkspace",
                                "ideWorkspace",
                                "stdin",
                                "codeStdin",
                                "language",
                                "lang",
                                "codeLang",
                            ].includes(patchKey),
                    ),
                ) as UnknownRecord
                : patch;

            const incomingWorkspaceForPreserveCheck = getPatchWorkspace(effectivePatch, existing);

            if (
                shouldPreserveExistingUserWorkspace({
                    existing,
                    incomingPatch: effectivePatch,
                    incomingWorkspace: incomingWorkspaceForPreserveCheck,
                    patchCarriesWorkspaceOrCode,
                })
            ) {
                starterLoopTrace("runtime.patchExercise.preserveExistingUserWorkspace", {
                    key,
                    existingWorkspaceKey: workspaceContentKey(existing?.workspace ?? null),
                    incomingWorkspaceKey: workspaceContentKey(incomingWorkspaceForPreserveCheck),
                    existingCodeLength: String(
                        existing?.code ??
                        existing?.source ??
                        deriveCodeFromWorkspace(existing?.workspace ?? null) ??
                        "",
                    ).length,
                    incomingCodeLength: String(
                        getPatchCodeForPreserveCheck(
                            effectivePatch,
                            incomingWorkspaceForPreserveCheck,
                        ) ?? "",
                    ).length,
                    incomingPatchKeys: Object.keys(effectivePatch ?? {}),
                    incomingWorkspaceOrigin: effectivePatch.workspaceOrigin,
                    incomingUserEdited: effectivePatch.userEdited,
                    incomingCorrect: isCorrectRuntimePatch(effectivePatch),
                });

                effectivePatch = preserveExistingUserWorkspacePatch({
                    existing: existing!,
                    incomingPatch: effectivePatch,
                });
            }

            const patchHasWorkspace =
                isWorkspace(effectivePatch.workspace) ||
                isWorkspace(effectivePatch.codeWorkspace) ||
                isWorkspace(effectivePatch.ideWorkspace);
            const rawIncomingWorkspace = getPatchWorkspace(effectivePatch, existing);
            const incomingWorkspace =
                !patchHasWorkspace &&
                typeof effectivePatch.code === "string" &&
                (effectivePatch.userEdited === true || effectivePatch.workspaceOrigin === "user")
                    ? workspaceWithEntryCode(rawIncomingWorkspace, effectivePatch.code)
                    : rawIncomingWorkspace;
            const shouldPreserveExistingMissingFiles =
                !(
                    effectivePatch.userEdited === true ||
                    effectivePatch.workspaceOrigin === "user" ||
                    effectivePatch.updateOrigin === "user" ||
                    effectivePatch.dismissFeedbackOnEdit === true
                );
            const mergedIncomingWorkspace =
                shouldPreserveExistingMissingFiles && incomingWorkspace && existing?.workspace
                    ? mergeMissingFilesFromWorkspace(incomingWorkspace, existing.workspace)
                    : incomingWorkspace;

            if (!existing && !mergedIncomingWorkspace) return state;

            const stdin =
                typeof effectivePatch.stdin === "string"
                    ? effectivePatch.stdin
                    : typeof effectivePatch.codeStdin === "string"
                        ? effectivePatch.codeStdin
                        : typeof mergedIncomingWorkspace?.stdin === "string"
                            ? mergedIncomingWorkspace.stdin
                            : existing?.stdin ?? "";

            const normalized = mergedIncomingWorkspace
                ? normalizeWorkspacePatch({workspace: mergedIncomingWorkspace, stdin})
                : null;

            const workspace = normalized?.workspace ?? existing!.workspace;

            /**
             * Workspace is canonical.
             *
             * If a workspace is present, derive code from the entry file.
             * Do not let stale patch.code resurrect starter code like:
             * print("Hello Python!")
             */
            const code =
                normalized?.code ??
                deriveCodeFromWorkspace(workspace) ??
                (typeof patch.code === "string" ? patch.code : "");

            exerciseDebug("H_reviewRuntimeStore_patchExercise", {
                key,
                existingExerciseId: existing?.exerciseId,
                patchExerciseId: (effectivePatch as any).exerciseId,
                patchKeys: Object.keys(effectivePatch ?? {}),
                patch: summarizeExercisePatch(effectivePatch),
                existing: summarizeExercisePatch(existing),
                nextCode: code,
                nextWorkspace: summarizeExerciseWorkspace(workspace),
            });

            reviewDebug("2_RUNTIME_PATCH reviewRuntimeStore.patchExercise", {
                key,
                patchKeys: Object.keys(effectivePatch ?? {}),
                patchCode: typeof effectivePatch.code === "string" ? effectivePatch.code : "",
                derivedCode: code,
                existingCode: existing?.code ?? "",
                workspace: summarizeWorkspace(workspace),
                existingExerciseId: existing?.exerciseId,
                patchExerciseId: (effectivePatch as any).exerciseId,
            });

            reviewSaveDebug("runtime patchExercise", {
                exerciseKey: key,
                patchKeys: Object.keys(effectivePatch ?? {}),
                patchUserEdited: (effectivePatch as any).userEdited,
                patchWorkspaceOrigin: (effectivePatch as any).workspaceOrigin,
                existingUserEdited: existing?.userEdited,
                existingWorkspaceOrigin: existing?.workspaceOrigin,
                nextCodeLength: String(code ?? "").length,
                stdinLength: String(stdin ?? "").length,
                workspace: summarizeWorkspaceForSave(workspace),
            });

            const nextLanguage = normalizeWorkspaceLanguage(
                typeof effectivePatch.language === "string"
                    ? effectivePatch.language
                    : typeof effectivePatch.lang === "string"
                        ? effectivePatch.lang
                        : existing?.language ?? workspace.language ?? "python",
            );

            const nextLang = normalizeWorkspaceLanguage(
                typeof effectivePatch.lang === "string"
                    ? effectivePatch.lang
                    : typeof effectivePatch.language === "string"
                        ? effectivePatch.language
                        : existing?.lang ?? nextLanguage,
                nextLanguage,
            );
            const nextWorkspaceOrigin: WorkspaceOrigin =
                effectivePatch.userEdited === true || effectivePatch.workspaceOrigin === "user"
                    ? "user"
                    : typeof effectivePatch.workspaceOrigin === "string"
                        ? effectivePatch.workspaceOrigin as WorkspaceOrigin
                        : existing?.workspaceOrigin ?? "restored";
            const nextUserEdited =
                effectivePatch.userEdited === true ||
                effectivePatch.workspaceOrigin === "user" ||
                effectivePatch.workspaceOrigin === "saved" ||
                existing?.userEdited === true;
            const nextStarterHash =
                typeof effectivePatch.starterHash === "string"
                    ? effectivePatch.starterHash
                    : existing?.starterHash;

            const existingWorkspaceKey = workspaceContentKey(existing?.workspace ?? null);
            const nextWorkspaceKey = workspaceContentKey(workspace ?? null);
            const patchHasTerminalEvidence = Object.prototype.hasOwnProperty.call(
                effectivePatch,
                "terminalEvidence",
            );
            const existingTerminalEvidenceKey = terminalEvidenceContentKey(
                (existing as any)?.terminalEvidence,
            );
            const nextTerminalEvidenceKey = terminalEvidenceContentKey(
                patchHasTerminalEvidence
                    ? (effectivePatch as any).terminalEvidence
                    : (existing as any)?.terminalEvidence,
            );
            const existingCode = String(
                existing?.code ?? deriveCodeFromWorkspace(existing?.workspace ?? null) ?? "",
            );
            const nextCode = String(code ?? "");
            const existingStdin = String(existing?.stdin ?? existing?.codeStdin ?? "");
            const nextStdin = String(stdin ?? "");
            const existingLanguage = String(existing?.language ?? existing?.lang ?? "");
            const nextLanguageComparable = String(nextLanguage ?? nextLang ?? "");

            const noMeaningfulChange = Boolean(
                existing &&
                existingWorkspaceKey === nextWorkspaceKey &&
                existingTerminalEvidenceKey === nextTerminalEvidenceKey &&
                existingCode === nextCode &&
                existingStdin === nextStdin &&
                existingLanguage === nextLanguageComparable &&
                existing.workspaceOrigin === nextWorkspaceOrigin &&
                Boolean(existing.userEdited) === Boolean(nextUserEdited) &&
                String(existing.starterHash ?? "") === String(nextStarterHash ?? ""),
            );

            starterLoopTrace("runtime.patchExercise.compare", {
                key,
                existingWorkspaceKey,
                nextWorkspaceKey,
                existingTerminalEvidenceKey,
                nextTerminalEvidenceKey,
                existingCodeLength: existingCode.length,
                nextCodeLength: nextCode.length,
                existingStdinLength: existingStdin.length,
                nextStdinLength: nextStdin.length,
                existingLanguage,
                nextLanguage: nextLanguageComparable,
                noop: noMeaningfulChange,
                patchKeys: Object.keys(effectivePatch ?? {}),
            });

            if (noMeaningfulChange) {
                reviewDebug("2_RUNTIME_PATCH reviewRuntimeStore.patchExercise.noop", {
                    key,
                    workspaceKey: nextWorkspaceKey,
                    codeLength: nextCode.length,
                    stdinLength: nextStdin.length,
                });
                return state;
            }

            const nextPending = new Set(state.persistence.pendingExerciseKeys);
            nextPending.add(key);

            const fallback: ExerciseRuntimeState = {
                exerciseKey: key,
                subjectSlug: existing?.subjectSlug ?? state.subjectSlug ?? "unknown",
                moduleSlug: existing?.moduleSlug ?? state.moduleSlug ?? "unknown",
                sectionSlug: existing?.sectionSlug ?? state.sectionSlug ?? undefined,
                topicId: existing?.topicId ?? state.viewTopicId ?? "unknown",
                cardId: existing?.cardId ?? "unknown",
                exerciseId:
                    typeof effectivePatch.exerciseId === "string"
                        ? effectivePatch.exerciseId
                        : getFinalExerciseIdFromKey(key),
                language: nextLanguage,
                workspace,
                stdin,
                runner: existing?.runner ?? {},
                answer: existing?.answer ?? {revealed: false},
                sketch: existing?.sketch ?? null,
                status: existing?.status ?? "in_progress",
                workspaceStatus: existing?.workspaceStatus ?? "ready",
                workspaceOrigin: nextWorkspaceOrigin,
                userEdited: nextUserEdited,
                starterHash: nextStarterHash,
                updatedAt: Date.now(),
                code,
                source: code,
                lang: nextLang,
                codeWorkspace: workspace,
                ideWorkspace: workspace,
                codeStdin: stdin,
            };

            const nextExercise: ExerciseRuntimeState = {
                ...fallback,
                ...existing,
                ...effectivePatch,
                workspace,
                codeWorkspace: workspace,
                ideWorkspace: workspace,
                stdin,
                codeStdin: stdin,
                code,
                source: code,
                language: nextLanguage,
                lang: nextLang,
                workspaceOrigin: nextWorkspaceOrigin,
                userEdited: nextUserEdited,
                starterHash: nextStarterHash,
                status:
                    existing?.status === "not_started" || !existing
                        ? "in_progress"
                        : existing.status,
                updatedAt: Date.now(),
            };

            const nextState: Partial<ReviewRuntimeStore> = {
                exercises: {
                    ...state.exercises,
                    [key]: nextExercise,
                },
                persistence: {
                    ...state.persistence,
                    dirty: true,
                    pendingExerciseKeys: nextPending,
                },
            };

            if (
                state.activeExerciseKey === key &&
                workspaceContentKey(state.boundToolWorkspace ?? null) !== workspaceContentKey(workspace ?? null)
            ) {
                nextState.boundToolWorkspace = workspace;
            }

            starterLoopTrace("runtime.patchExercise.write", {
                key,
                workspaceKey: nextWorkspaceKey,
                codeLength: nextCode.length,
                stdinLength: nextStdin.length,
                patched: true,
                willUpdateBoundToolWorkspace:
                    state.activeExerciseKey === key &&
                    workspaceContentKey(state.boundToolWorkspace ?? null) !== workspaceContentKey(workspace ?? null),
            });

            didPatch = true;
            return nextState;
        });

        if (didPatch) {
            get().queueAutosave();
        }
    },

    ensureCard: (args) => {
        const {cardKey, topicId, cardId, initial, starterSketch, toolLanguage = "python", toolManifest, toolKey} = args;

        set((state) => {
            const existing = state.cards[cardKey];
            const entry =
                state.targetRegistry?.byKey?.[`card:${cardKey}`] ??
                findTargetRegistryEntry(state.targetRegistry, cardKey, {
                    topicId,
                    cardId,
                    targetKind: "card",
                });

            reviewDebug("starter-files ensureCard.seed-source", {
                cardKey,
                topicId,
                cardId,
                entryFound: !!entry,
                entryTargetKey: entry?.targetKey,
                entryTargetSlug: entry?.targetSlug,
                entryKind: entry?.targetKind,
                entryStarterFilesCount: Array.isArray(entry?.starterFiles) ? entry.starterFiles.length : null,
                entryStarterCodeLength: typeof entry?.starterCode === "string" ? entry.starterCode.length : null,
                toolManifestId: asManifestRecord(toolManifest)?.id,
            });

            const resolvedTool = resolveCardToolSeed({
                language: toolLanguage,
                toolManifest,
                existing,
                entry,
            });

            starterLoopTrace("runtime.ensureCard.compare", {
                cardKey,
                existingWorkspaceKey: workspaceContentKey(existing?.toolWorkspace ?? null),
                nextWorkspaceKey: workspaceContentKey(resolvedTool.workspace ?? null),
                existingStatus: existing?.workspaceStatus,
                nextStatus: resolvedTool.workspaceStatus,
                existingSeedMode: existing?.workspaceSeedMode,
                nextSeedMode: resolvedTool.workspaceSeedMode,
                existingCodeLength: String(existing?.toolCode ?? "").length,
                nextCodeLength: String(resolvedTool.code ?? "").length,
                noop: Boolean(
                    existing &&
                    workspaceContentKey(existing.toolWorkspace ?? null) === workspaceContentKey(resolvedTool.workspace ?? null) &&
                    existing.workspaceStatus === resolvedTool.workspaceStatus &&
                    existing.workspaceSeedMode === resolvedTool.workspaceSeedMode &&
                    existing.workspaceOrigin === resolvedTool.workspaceOrigin &&
                    Boolean(existing.userEdited) === Boolean(resolvedTool.userEdited) &&
                    String(existing.starterHash ?? "") === String(resolvedTool.starterHash ?? "") &&
                    String(existing.toolCode ?? "") === String(resolvedTool.code ?? "") &&
                    String(existing.toolStdin ?? "") === String(resolvedTool.stdin ?? "") &&
                    String(existing.toolLang ?? "") === String(resolvedTool.lang ?? "")
                ),
            });

            if (
                existing &&
                workspaceContentKey(existing.toolWorkspace ?? null) === workspaceContentKey(resolvedTool.workspace ?? null) &&
                existing.workspaceStatus === resolvedTool.workspaceStatus &&
                existing.workspaceSeedMode === resolvedTool.workspaceSeedMode &&
                existing.workspaceOrigin === resolvedTool.workspaceOrigin &&
                Boolean(existing.userEdited) === Boolean(resolvedTool.userEdited) &&
                String(existing.starterHash ?? "") === String(resolvedTool.starterHash ?? "") &&
                String(existing.toolCode ?? "") === String(resolvedTool.code ?? "") &&
                String(existing.toolStdin ?? "") === String(resolvedTool.stdin ?? "") &&
                String(existing.toolLang ?? "") === String(resolvedTool.lang ?? "")
            ) {
                return state;
            }

            const card: CardRuntimeState = {
                cardKey,
                topicId,
                cardId,
                visited: existing?.visited ?? initial?.visited ?? false,
                completed: existing?.completed ?? initial?.completed ?? false,
                sketch: resolveSketchState({
                    savedSketch: existing?.sketch ?? initial?.sketch ?? null,
                    starterSketch: starterSketch ?? null,
                }),
                workspaceStatus: resolvedTool.workspaceStatus,
                workspaceSeedMode: resolvedTool.workspaceSeedMode,
                workspaceOrigin: resolvedTool.workspaceOrigin,
                userEdited: resolvedTool.userEdited,
                starterHash: resolvedTool.starterHash,
                toolKey: existing?.toolKey ?? toolKey ?? `${cardKey}:general`,
                toolWorkspace: resolvedTool.workspace,
                toolCode: resolvedTool.code,
                toolStdin: resolvedTool.stdin,
                toolLang: resolvedTool.lang,
                updatedAt:
                    typeof existing?.updatedAt === "number"
                        ? existing.updatedAt
                        : typeof initial?.updatedAt === "number"
                            ? initial.updatedAt
                            : Date.now(),
            };

            return {
                cards: {
                    ...state.cards,
                    [cardKey]: card,
                },
            };
        });
    },
    clearRuntimeForTopic: (topicId) => {
        set((state) => ({
            activeExerciseKey:
                state.activeExerciseKey &&
                state.exercises[state.activeExerciseKey]?.topicId === topicId
                    ? null
                    : state.activeExerciseKey,

            boundToolWorkspace:
                state.activeExerciseKey &&
                state.exercises[state.activeExerciseKey]?.topicId === topicId
                    ? null
                    : state.boundToolWorkspace,

            exercises: Object.fromEntries(
                Object.entries(state.exercises).filter(([, value]) => {
                    return String((value as any)?.topicId ?? "") !== topicId;
                }),
            ),

            cards: Object.fromEntries(
                Object.entries(state.cards).filter(([, value]) => {
                    return String((value as any)?.topicId ?? "") !== topicId;
                }),
            ),

            editorRuntimes: Object.fromEntries(
                Object.entries(state.editorRuntimes).filter(([, value]) => {
                    return String((value as any)?.topicId ?? "") !== topicId;
                }),
            ),

            tool: {
                ...state.tool,
                boundExerciseKey:
                    state.tool.boundExerciseKey &&
                    state.exercises[state.tool.boundExerciseKey]?.topicId === topicId
                        ? null
                        : state.tool.boundExerciseKey,
            },
            persistence: {
                dirty: false,
                pendingExerciseKeys: new Set(),
                pendingCardKeys: new Set(),
            },
        }));
    },

    clearRuntimeForCard: (topicId, cardId) => {
        set((state) => ({
            activeExerciseKey:
                state.activeExerciseKey &&
                state.exercises[state.activeExerciseKey]?.topicId === topicId &&
                state.exercises[state.activeExerciseKey]?.cardId === cardId
                    ? null
                    : state.activeExerciseKey,

            boundToolWorkspace:
                state.activeExerciseKey &&
                state.exercises[state.activeExerciseKey]?.topicId === topicId &&
                state.exercises[state.activeExerciseKey]?.cardId === cardId
                    ? null
                    : state.boundToolWorkspace,

            exercises: Object.fromEntries(
                Object.entries(state.exercises).filter(([, value]) => {
                    return !(
                        String((value as any)?.topicId ?? "") === topicId &&
                        String((value as any)?.cardId ?? "") === cardId
                    );
                }),
            ),

            cards: Object.fromEntries(
                Object.entries(state.cards).filter(([, value]) => {
                    return !(
                        String((value as any)?.topicId ?? "") === topicId &&
                        String((value as any)?.cardId ?? "") === cardId
                    );
                }),
            ),

            editorRuntimes: Object.fromEntries(
                Object.entries(state.editorRuntimes).filter(([, value]) => {
                    return !(
                        String((value as any)?.topicId ?? "") === topicId &&
                        String((value as any)?.cardId ?? "") === cardId
                    );
                }),
            ),

            tool: {
                ...state.tool,
                boundExerciseKey:
                    state.tool.boundExerciseKey &&
                    state.exercises[state.tool.boundExerciseKey]?.topicId === topicId &&
                    state.exercises[state.tool.boundExerciseKey]?.cardId === cardId
                        ? null
                        : state.tool.boundExerciseKey,
            }, persistence: {
                dirty: false,
                pendingExerciseKeys: new Set(),
                pendingCardKeys: new Set(),
            },
        }));
    },

    clearRuntimeForModule: () => {
        set({
            activeExerciseKey: null,
            boundToolWorkspace: null,
            exercises: {},
            cards: {},
            editorRuntimes: {},
            tool: {
                boundExerciseKey: null,
            },
            persistence: {
                dirty: false,
                pendingExerciseKeys: new Set(),
                pendingCardKeys: new Set(),
            },
        });
    },
    patchCard: (key, patch) => {
        let didPatch = false;

        set((state) => {
            const existing = state.cards[key];

            const fallback: CardRuntimeState = {
                cardKey: key,
                topicId: existing?.topicId ?? state.viewTopicId ?? "unknown",
                cardId: existing?.cardId ?? key,
                visited: existing?.visited ?? false,
                completed: existing?.completed ?? false,
                sketch: existing?.sketch ?? null,
                workspaceStatus: existing?.workspaceStatus ?? "pending",
                workspaceSeedMode: existing?.workspaceSeedMode,
                workspaceOrigin: existing?.workspaceOrigin,
                userEdited: existing?.userEdited ?? false,
                starterHash: existing?.starterHash,
                toolWorkspace: existing?.toolWorkspace ?? null,
                toolCode: existing?.toolCode ?? "",
                toolStdin: existing?.toolStdin ?? "",
                toolLang: existing?.toolLang ?? "python",
                updatedAt: existing?.updatedAt ?? Date.now(),
            };

            const nextCard: CardRuntimeState = {
                ...fallback,
                ...existing,
                ...patch,
                workspaceOrigin:
                    patch.userEdited === true || patch.workspaceOrigin === "user"
                        ? "user"
                        : patch.workspaceOrigin ?? existing?.workspaceOrigin ?? fallback.workspaceOrigin,
                userEdited:
                    patch.userEdited === true ||
                    patch.workspaceOrigin === "user" ||
                    existing?.userEdited === true,
                starterHash:
                    typeof patch.starterHash === "string"
                        ? patch.starterHash
                        : existing?.starterHash ?? fallback.starterHash,
                updatedAt: Date.now(),
            };

            const noMeaningfulChange = Boolean(
                existing &&
                existing.topicId === nextCard.topicId &&
                existing.cardId === nextCard.cardId &&
                existing.visited === nextCard.visited &&
                existing.completed === nextCard.completed &&
                existing.workspaceStatus === nextCard.workspaceStatus &&
                existing.workspaceSeedMode === nextCard.workspaceSeedMode &&
                existing.workspaceOrigin === nextCard.workspaceOrigin &&
                Boolean(existing.userEdited) === Boolean(nextCard.userEdited) &&
                String(existing.starterHash ?? "") === String(nextCard.starterHash ?? "") &&
                workspaceContentKey(existing.toolWorkspace ?? null) === workspaceContentKey(nextCard.toolWorkspace ?? null) &&
                String(existing.toolCode ?? "") === String(nextCard.toolCode ?? "") &&
                String(existing.toolStdin ?? "") === String(nextCard.toolStdin ?? "") &&
                String(existing.toolLang ?? "") === String(nextCard.toolLang ?? "") &&
                JSON.stringify(existing.sketch ?? null) === JSON.stringify(nextCard.sketch ?? null)
            );

            starterLoopTrace("runtime.patchCard.compare", {
                key,
                existingWorkspaceKey: workspaceContentKey(existing?.toolWorkspace ?? null),
                nextWorkspaceKey: workspaceContentKey(nextCard.toolWorkspace ?? null),
                existingStatus: existing?.workspaceStatus,
                nextStatus: nextCard.workspaceStatus,
                existingSeedMode: existing?.workspaceSeedMode,
                nextSeedMode: nextCard.workspaceSeedMode,
                existingCodeLength: String(existing?.toolCode ?? "").length,
                nextCodeLength: String(nextCard.toolCode ?? "").length,
                noop: noMeaningfulChange,
                patchKeys: Object.keys(patch ?? {}),
            });

            reviewSaveDebug("runtime patchCard incoming", {
                cardKey: key,
                topicId: nextCard.topicId,
                cardId: nextCard.cardId,
                toolKey: nextCard.toolKey,
                patchKeys: Object.keys(patch ?? {}),
                userEdited: nextCard.userEdited,
                workspaceOrigin: nextCard.workspaceOrigin,
                workspaceStatus: nextCard.workspaceStatus,
                toolCodeLength: String(nextCard.toolCode ?? "").length,
                toolStdinLength: String(nextCard.toolStdin ?? "").length,
                toolWorkspace: summarizeWorkspaceForSave(nextCard.toolWorkspace),
            });

            if (noMeaningfulChange) {
                reviewDebug("2_RUNTIME_PATCH reviewRuntimeStore.patchCard.noop", {
                    key,
                    workspaceKey: workspaceContentKey(nextCard.toolWorkspace ?? null),
                    codeLength: String(nextCard.toolCode ?? "").length,
                });
                return state;
            }

            const nextPending = new Set(state.persistence.pendingCardKeys);
            nextPending.add(key);

            didPatch = true;

            return {
                cards: {
                    ...state.cards,
                    [key]: {
                        ...nextCard,
                        updatedAt: Date.now(),
                    },
                },
                persistence: {
                    ...state.persistence,
                    dirty: true,
                    pendingCardKeys: nextPending,
                },
            };
        });

        if (didPatch) {
            get().queueAutosave();
        }
    },

    ensureEditorSource: (source) => {
        set((state) => {
            const existing = state.editorRuntimes[source.ownerKey] ?? null;
            const existingCard = source.ownerKind === "card" ? state.cards[source.ownerKey] ?? null : null;
            const existingExercise =
                source.ownerKind === "exercise" ? state.exercises[source.ownerKey] ?? null : null;

            const resolved = resolveEditorRuntimeSeed({
                source,
                existing,
                existingCard,
                existingExercise,
            });

            const nextRuntime: EditorRuntimeState = {
                ownerKey: source.ownerKey,
                ownerKind: source.ownerKind,
                targetKey: source.targetKey,
                toolScopeKey: source.toolScopeKey,
                language: resolved.language,
                workspaceStatus: resolved.workspaceStatus,
                workspaceSeedMode: resolved.workspaceSeedMode,
                workspaceOrigin: resolved.workspaceOrigin as WorkspaceOrigin | undefined,
                userEdited: resolved.userEdited,
                starterHash: resolved.starterHash,
                workspace: resolved.workspace,
                code: String(resolved.code ?? ""),
                stdin: String(resolved.stdin ?? ""),
                updatedAt: existing?.updatedAt ?? Date.now(),
            };

            const noMeaningfulChange =
                existing &&
                existing.ownerKind === nextRuntime.ownerKind &&
                existing.targetKey === nextRuntime.targetKey &&
                existing.toolScopeKey === nextRuntime.toolScopeKey &&
                existing.language === nextRuntime.language &&
                existing.workspaceStatus === nextRuntime.workspaceStatus &&
                existing.workspaceSeedMode === nextRuntime.workspaceSeedMode &&
                existing.workspaceOrigin === nextRuntime.workspaceOrigin &&
                Boolean(existing.userEdited) === Boolean(nextRuntime.userEdited) &&
                String(existing.starterHash ?? "") === String(nextRuntime.starterHash ?? "") &&
                existing.code === nextRuntime.code &&
                existing.stdin === nextRuntime.stdin &&
                workspaceContentKey(existing.workspace ?? null) === workspaceContentKey(nextRuntime.workspace ?? null);

            if (noMeaningfulChange) return state;

            return {
                editorRuntimes: {
                    ...state.editorRuntimes,
                    [source.ownerKey]: nextRuntime,
                },
            };
        });
    },

    patchEditorWorkspace: (ownerKey, workspace) => {
        let didPatch = false;

        set((state) => {
            const existing = state.editorRuntimes[ownerKey];
            if (!existing) return state;
            const existingExercise =
                existing.ownerKind === "exercise" ? state.exercises[ownerKey] ?? null : null;
            const expectedLanguage = String(
                existingExercise?.language ??
                existingExercise?.lang ??
                workspaceLanguage(existingExercise?.workspace) ??
                existing.language ??
                "",
            ).trim();
            const incomingLanguage = workspaceLanguage(workspace);

            if (
                existing.ownerKind === "exercise" &&
                expectedLanguage &&
                incomingLanguage &&
                !languagesCompatible(expectedLanguage, incomingLanguage)
            ) {
                starterLoopTrace("runtime.patchEditorWorkspace.skipIncompatibleWorkspace", {
                    key: ownerKey,
                    expectedLanguage,
                    incomingLanguage,
                    existingWorkspaceKey: workspaceContentKey(existing.workspace ?? null),
                    incomingWorkspaceKey: workspaceContentKey(workspace ?? null),
                });
                return state;
            }

            const nextCode = deriveCodeFromWorkspace(workspace) ?? "";
            const nextStdin =
                typeof workspace?.stdin === "string" ? workspace.stdin : existing.stdin ?? "";
            const nextWorkspaceKey = workspaceContentKey(workspace ?? null);
            const existingWorkspaceKey = workspaceContentKey(existing.workspace ?? null);

            if (
                existingWorkspaceKey === nextWorkspaceKey &&
                String(existing.code ?? "") === String(nextCode) &&
                String(existing.stdin ?? "") === String(nextStdin)
            ) {
                return state;
            }

            const nextEditorRuntime: EditorRuntimeState = {
                ...existing,
                workspace,
                code: nextCode,
                stdin: nextStdin,
                workspaceStatus: workspace ? "ready" : "pending",
                workspaceSeedMode: workspace ? "restored" : existing.workspaceSeedMode,
                workspaceOrigin: workspace ? "user" : existing.workspaceOrigin,
                userEdited: workspace ? true : existing.userEdited,
                updatedAt: Date.now(),
            };
            /**
             * patchEditorWorkspace receives the visible editor workspace after a user/run
             * action. Treat that workspace as authoritative. Re-merging missing files from
             * the previously saved exercise/card workspace resurrects files the runner just
             * deleted, such as output.txt in the workspace sync E2E tests.
             *
             * Required starter/fixture files are restored earlier when a target is resolved
             * and registered, not during every user workspace patch.
             */
            const nextExerciseWorkspace = workspace ?? null;
            const nextCardWorkspace = workspace ?? null;

            const nextPendingExerciseKeys = new Set(state.persistence.pendingExerciseKeys);
            const nextPendingCardKeys = new Set(state.persistence.pendingCardKeys);
            let persistenceDirty = false;
            const now = Date.now();
            const nextState: Partial<ReviewRuntimeState> = {
                editorRuntimes: {
                    ...state.editorRuntimes,
                    [ownerKey]: nextEditorRuntime,
                },
            };

            if (existing.ownerKind === "exercise") {
                const ex = state.exercises[ownerKey];
                const parsed = parseRuntimeOwnerKey(ownerKey);
                const baseExercise: ExerciseRuntimeState = ex ?? {
                    exerciseKey: ownerKey,
                    subjectSlug: state.subjectSlug ?? parsed.subjectSlug,
                    moduleSlug: state.moduleSlug ?? parsed.moduleSlug,
                    sectionSlug: state.sectionSlug ?? parsed.sectionSlug,
                    topicId: parsed.topicId,
                    cardId: parsed.cardId,
                    exerciseId: parsed.exerciseId,
                    language: existing.language,
                    workspace: workspace ?? null,
                    stdin: nextStdin,
                    runner: {},
                    answer: {revealed: false},
                    sketch: null,
                    status: "in_progress",
                    workspaceStatus: workspace ? "ready" : "pending",
                    workspaceOrigin: workspace ? "user" : existing.workspaceOrigin,
                    userEdited: workspace ? true : existing.userEdited,
                    starterHash: existing.starterHash,
                    updatedAt: now,
                    code: nextCode,
                    lang: existing.language,
                    codeWorkspace: nextExerciseWorkspace ?? undefined,
                    ideWorkspace: nextExerciseWorkspace ?? undefined,
                    codeStdin: nextStdin,
                } as ExerciseRuntimeState;

                nextState.exercises = {
                    ...state.exercises,
                    [ownerKey]: {
                        ...baseExercise,
                        workspace: nextExerciseWorkspace ?? baseExercise.workspace,
                        stdin: nextStdin,
                        code: nextCode,
                        language: existing.language,
                        lang: existing.language,
                        codeWorkspace: nextExerciseWorkspace ?? baseExercise.workspace,
                        ideWorkspace: nextExerciseWorkspace ?? baseExercise.workspace,
                        codeStdin: nextStdin,
                        workspaceStatus: nextExerciseWorkspace ? "ready" : baseExercise.workspaceStatus,
                        workspaceOrigin: nextExerciseWorkspace ? "user" : baseExercise.workspaceOrigin,
                        userEdited: nextExerciseWorkspace ? true : baseExercise.userEdited,
                        starterHash: baseExercise.starterHash ?? existing.starterHash,
                        status: baseExercise.status === "not_started" ? "in_progress" : baseExercise.status,
                        updatedAt: now,
                    },
                };
                nextPendingExerciseKeys.add(ownerKey);
                persistenceDirty = true;
            } else {
                const card = state.cards[ownerKey];
                const parsed = parseRuntimeOwnerKey(ownerKey);
                const baseCard: CardRuntimeState = card ?? {
                    cardKey: ownerKey,
                    topicId: parsed.topicId,
                    cardId: parsed.cardId,
                    visited: true,
                    completed: false,
                    sketch: null,
                    workspaceStatus: workspace ? "ready" : "pending",
                    workspaceSeedMode: workspace ? "restored" : existing.workspaceSeedMode,
                    workspaceOrigin: workspace ? "user" : existing.workspaceOrigin,
                    userEdited: workspace ? true : existing.userEdited,
                    starterHash: existing.starterHash,
                    toolKey: existing.toolScopeKey || `${ownerKey}:general`,
                    toolWorkspace: nextCardWorkspace,
                    toolCode: nextCode,
                    toolStdin: nextStdin,
                    toolLang: existing.language,
                    updatedAt: now,
                };

                nextState.cards = {
                    ...state.cards,
                    [ownerKey]: {
                        ...baseCard,
                        toolKey: baseCard.toolKey ?? existing.toolScopeKey ?? `${ownerKey}:general`,
                        toolWorkspace: nextCardWorkspace,
                        toolCode: nextCode,
                        toolStdin: nextStdin,
                        toolLang: existing.language,
                        workspaceStatus: nextCardWorkspace ? "ready" : baseCard.workspaceStatus,
                        workspaceSeedMode: nextCardWorkspace ? "restored" : baseCard.workspaceSeedMode,
                        workspaceOrigin: nextCardWorkspace ? "user" : baseCard.workspaceOrigin,
                        userEdited: nextCardWorkspace ? true : baseCard.userEdited,
                        starterHash: baseCard.starterHash ?? existing.starterHash,
                        visited: true,
                        updatedAt: now,
                    },
                };
                nextPendingCardKeys.add(ownerKey);
                persistenceDirty = true;
            }

            if (persistenceDirty) {
                nextState.persistence = {
                    ...state.persistence,
                    dirty: true,
                    pendingExerciseKeys: nextPendingExerciseKeys,
                    pendingCardKeys: nextPendingCardKeys,
                };
            }

            didPatch = true;
            return nextState;
        });

        if (didPatch) {
            get().queueAutosave();
        }
    },

    bindExerciseTool: (key) => {
        const current = get().tool.boundExerciseKey;

        /**
         * Idempotent bind.
         * Prevents render/effect loops when the active exercise asks to bind
         * while the tool is already bound to the same exercise.
         */
        if (current === key && get().activeExerciseKey === key) {
            return;
        }

        if (current && current !== key) {
            get().flushToolSnapshot();
        }

        set((state) => {
            if (
                state.tool.boundExerciseKey === key &&
                state.activeExerciseKey === key
            ) {
                return state;
            }

            const exercise = state.exercises[key];

            return {
                activeExerciseKey: key,
                boundToolWorkspace: exercise?.workspace ?? null,
                tool: {
                    ...state.tool,
                    boundExerciseKey: key,
                },
            };
        });
    },

    unbindExerciseTool: (key) => {
        const current = get().tool.boundExerciseKey;
        if (current !== key) return;

        get().flushToolSnapshot();

        set((state) => ({
            activeExerciseKey:
                state.activeExerciseKey === key ? null : state.activeExerciseKey,
            boundToolWorkspace: state.activeExerciseKey === key ? null : state.boundToolWorkspace,
            tool: {
                ...state.tool,
                boundExerciseKey: null,
            },
        }));
    },

    patchBoundToolWorkspace: (workspace) => {
        const key = get().tool.boundExerciseKey;
        if (!key) return;

        set({boundToolWorkspace: workspace});

        const normalized = normalizeWorkspacePatch({workspace});

        get().patchExercise(key, {
            ...normalized,
            userEdited: true,
            workspaceOrigin: "user",
        });
    },

    setFlushToolSnapshotCallback: (cb) => {
        set({_flushToolSnapshotCb: cb});
    },

    flushToolSnapshot: () => {
        const cb = get()._flushToolSnapshotCb;
        if (cb) cb();
    },

    flushBeforeNavigation: (callbacks) => {
        get().flushToolSnapshot();
        callbacks?.flushTool?.();
        callbacks?.flushSketch?.();
        callbacks?.flushProgress?.();
    },

    goToCard: (index, callbacks) => {
        get().flushBeforeNavigation(callbacks);
        set({activeCardIndex: index});
    },

    /**
     * DETERMINISTIC TARGET SYNC
     *
     * This is the single entry point for ensuring the runtime store is ready
     * for a given route target.
     */
    syncActiveTarget: (target, registryOverride) => {
        if (!target) return;

        const {targetRegistry: storeTargetRegistry, subjectSlug, moduleSlug} = get();
        const targetRegistry = registryOverride ?? storeTargetRegistry;
        if (!targetRegistry) return;

        const routeKey = `${target.sectionSlug}/${target.topicSlug}/${target.targetKind}/${target.targetSlug}`;
        const targetKey = targetRegistry?.byRoute?.[routeKey] ?? null;
        const registryEntry = targetKey ? targetRegistry?.byKey?.[targetKey] ?? null : null;
        if (!registryEntry) return;
        const isLegacyExerciseAliasRoute =
            target.kind === "exercise" &&
            typeof registryEntry.exerciseId === "string" &&
            registryEntry.exerciseId.trim().length > 0 &&
            registryEntry.exerciseId !== target.exerciseId;
        const editorSource = resolveDeterministicEditorSource(registryEntry);

        if (editorSource && !isLegacyExerciseAliasRoute) {
            get().ensureEditorSource(editorSource);
        }

        if (target.kind === "exercise") {
            if (isLegacyExerciseAliasRoute) {
                return;
            }
            const routeExerciseManifest = buildRouteExerciseManifestFromEntry(registryEntry);
            const existingExercise = get().exercises[target.exerciseStateKey] ?? null;
            const routeLanguage = resolveCourseLanguage({
                subjectSlug: subjectSlug ?? "",
                language:
                    routeExerciseManifest?.language ??
                    routeExerciseManifest?.lang ??
                    registryEntry?.language,
                runtimeDefaults:
                    registryEntry?.runtimeDefaults ??
                    registryEntry?.topicRuntimeDefaults ??
                    registryEntry?.moduleRuntimeDefaults ??
                    null,
                target: routeExerciseManifest ?? registryEntry?.item ?? null,
            });
            const existingLanguage = String(
                existingExercise?.language ??
                existingExercise?.lang ??
                workspaceLanguage(existingExercise?.workspace) ??
                "",
            ).trim();
            const shouldPreserveExistingExercise =
                Boolean(existingExercise) &&
                Boolean(existingLanguage) &&
                Boolean(routeLanguage) &&
                !languagesCompatible(existingLanguage, routeLanguage);

            if (shouldPreserveExistingExercise) {
                get().bindExerciseTool(target.exerciseStateKey);
                return;
            }

            get().ensureExercise({
                exerciseKey: target.exerciseStateKey,
                subjectSlug: subjectSlug ?? "",
                moduleSlug: moduleSlug ?? "",
                sectionSlug: target.sectionSlug,
                topicId: target.topicId,
                cardId: target.cardId,
                manifest: routeExerciseManifest,
                entry: registryEntry,
            });
            // Automatically bind if it's an exercise target
            get().bindExerciseTool(target.exerciseStateKey);
        } else if (target.kind === "card") {
            const cardKey =
                registryEntry?.cardKey ??
                getCardStateKey({
                    subjectSlug: subjectSlug ?? "",
                    moduleSlug: moduleSlug ?? "",
                    sectionSlug: target.sectionSlug,
                    topicId: target.topicId,
                    cardId: target.cardId,
                });
            get().ensureCard({
                cardKey,
                topicId: target.topicId,
                cardId: target.cardId,
                toolLanguage: registryEntry?.language ?? "python",
                toolManifest: registryEntry?.toolManifest ?? registryEntry?.item ?? null,
                toolKey: registryEntry?.toolScopeKey ?? `${cardKey}:general`,
            });
            // Unbind exercise if we moved to a regular card
            get().unbindExerciseTool(get().tool.boundExerciseKey ?? "");
        }
    },

    queueAutosave: () => {
        // DB persistence is bridged by useReviewProgress subscribing to this store.
    },

    flushNow: async () => {
        // DB persistence is bridged by useReviewProgress.
        // This action exists so navigation/tool code has a stable runtime API.
    },
}));
