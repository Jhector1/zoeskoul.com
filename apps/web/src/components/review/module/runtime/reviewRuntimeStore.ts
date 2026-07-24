import {create} from "zustand";
import type {WorkspaceStateV2} from "@/components/ide/types";
import type {LooseManifestRecord, ReviewTargetRegistry} from "./reviewTargetRegistry";
import type {
    CardRuntimeState,
    EditorRuntimeState,
    ExerciseRuntimeState,
    RuntimeFileEditEntry,
    RuntimeFileEditOrigin,
    RuntimeFileEditState,
    RuntimeWorkspaceMutation,
    RuntimeWorkspaceMutationType,
    ResetExerciseToStarterArgs,
    ResetExerciseToStarterResult,
    ReviewRuntimeState,
    ReviewRuntimeStore,
    UnknownRecord,
    WorkspaceOrigin,
} from "./reviewRuntimeTypes";
import {getCardStateKey, getExerciseStateKey} from "./exerciseKeys";
import {resolveExerciseWorkspace} from "./exerciseWorkspaceResolver";
import type { ReviewTargetEntry } from "./reviewTargetRegistry";
import type { ReviewResolvedRouteTarget } from "./reviewRoute";
import { resolveWorkspaceForTarget } from "./resolveWorkspaceForTarget";
import {resolveCourseLanguage, resolveCourseSqlRunnerConfig} from "./courseProfiles";
import {resolveDeterministicEditorSource, type ReviewDeterministicEditorSource} from "./deterministicEditorSource";
import {resolveSketchState} from "./sketchResolver";
import {reviewDebug, summarizeWorkspace} from "./reviewDebug";
import {exerciseDebug, summarizeExercisePatch, summarizeExerciseWorkspace} from "./exerciseDebug";
import {reviewSaveDebug, summarizeWorkspaceForSave} from "./reviewSaveDebug";
import {languagesCompatible} from "@/components/review/module/utils";
import {normalizeTopicProgressKey} from "@/lib/review/progressTopicKeys";
import {normalizeWorkspaceLanguage} from "./workspaceCodeSource";
import {
    hasStarterIntentValue,
    workspaceHasUsableStarterContent
} from "@/components/review/module/runtime/starterContent";

type InternalStore = ReviewRuntimeStore;

/**
 * Imperative bridge for the currently mounted review tools provider.
 *
 * This callback is intentionally kept outside Zustand state. Registering a
 * React callback is not application state and must not publish a store update;
 * doing so can cause the provider effect to re-run recursively while exercise
 * bindings are reconciling.
 */
const toolSnapshotFlushBridge: { current: (() => void) | null } = {
    current: null,
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

function resolveWorkspaceGeneration(
    incomingGeneration: unknown,
    fallbackGeneration: number,
) {
    if (!Number.isFinite(incomingGeneration)) {
        return Math.max(0, Math.trunc(fallbackGeneration));
    }

    return Math.max(0, Math.trunc(Number(incomingGeneration)));
}

function isStaleWorkspaceGeneration(
    incomingGeneration: unknown,
    activeGeneration: number,
) {
    if (!Number.isFinite(incomingGeneration)) return false;
    return Math.trunc(Number(incomingGeneration)) < Math.trunc(activeGeneration);
}

function normalizeGenerationValue(value: unknown, fallback = 0) {
    return Number.isFinite(value)
        ? Math.max(0, Math.trunc(Number(value)))
        : Math.max(0, Math.trunc(fallback));
}

function patchCarriesWorkspaceState(patch: UnknownRecord | null | undefined) {
    if (!patch) return false;

    return Boolean(
        isWorkspace((patch as any).workspace) ||
        isWorkspace((patch as any).codeWorkspace) ||
        isWorkspace((patch as any).ideWorkspace) ||
        isWorkspace((patch as any).starterWorkspace) ||
        typeof (patch as any).code === "string" ||
        typeof (patch as any).source === "string" ||
        typeof (patch as any).stdin === "string" ||
        typeof (patch as any).codeStdin === "string",
    );
}

function normalizeChangedFilePaths(value: unknown) {
    if (!Array.isArray(value)) return undefined;

    const normalized = Array.from(
        new Set(
            value
                .map((entry) => String(entry ?? "").trim())
                .filter(Boolean),
        ),
    );

    return normalized.length > 0 ? normalized : undefined;
}

function normalizeRuntimeWorkspaceMutation(args: {
    generation?: unknown;
    source?: unknown;
    mutation?: RuntimeWorkspaceMutation | null;
}) {
    const source = String(
        args.mutation?.source ??
        args.source ??
        "",
    ).trim();
    const generation = Number.isFinite(args.mutation?.generation)
        ? Math.max(0, Math.trunc(Number(args.mutation?.generation)))
        : Number.isFinite(args.generation)
            ? Math.max(0, Math.trunc(Number(args.generation)))
            : undefined;
    const mutationType = String(args.mutation?.mutation ?? "").trim() as RuntimeWorkspaceMutationType;

    if (
        generation == null ||
        !source ||
        ![
            "user-content",
            "user-structure",
            "hydrate",
            "runtime-sync",
            "cache-sync",
            "reset",
        ].includes(mutationType)
    ) {
        return null;
    }

    return {
        generation,
        source,
        mutation: mutationType,
        changedFilePaths: normalizeChangedFilePaths(args.mutation?.changedFilePaths),
    } satisfies RuntimeWorkspaceMutation;
}

function isBlankRuntimeFileContent(value: unknown) {
    return String(value ?? "").trim().length === 0;
}

function runtimeFileMap(workspace: WorkspaceStateV2 | null | undefined) {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return new Map<string, any>();
    }

    return new Map(
        workspace.nodes
            .filter((node: any) => node?.kind === "file")
            .map((node: any) => [runtimePathForNode(workspace.nodes as any[], node), node] as const)
            .filter(([path]) => Boolean(path)),
    );
}

function cloneRuntimeWorkspace(workspace: WorkspaceStateV2) {
    return {
        ...workspace,
        nodes: workspace.nodes.map((node: any) => ({ ...node })),
        openTabs: [...(workspace.openTabs ?? [])],
        expanded: [...(workspace.expanded ?? [])],
    } as WorkspaceStateV2;
}

function buildRuntimeFileEditState(args: {
    workspace: WorkspaceStateV2 | null | undefined;
    generation: number;
    origin: RuntimeFileEditOrigin;
    hasUserEdited: boolean;
}) {
    const next: RuntimeFileEditState = {};

    for (const path of runtimeFileMap(args.workspace).keys()) {
        next[path] = {
            generation: args.generation,
            origin: args.origin,
            hasUserEdited: args.hasUserEdited,
        };
    }

    return next;
}

function mergeRuntimeFileEditState(args: {
    existing: RuntimeFileEditState | null | undefined;
    existingWorkspace: WorkspaceStateV2 | null | undefined;
    incomingWorkspace: WorkspaceStateV2 | null | undefined;
    generation: number;
    origin: RuntimeFileEditOrigin;
    mutationType?: RuntimeWorkspaceMutationType | null;
    changedFilePaths?: string[];
}) {
    const next: RuntimeFileEditState = {
        ...(args.existing ?? {}),
    };
    const incomingFiles = runtimeFileMap(args.incomingWorkspace);
    const changedPaths = new Set(args.changedFilePaths ?? []);
    const shouldClearUserEdited =
        args.mutationType === "reset" || args.origin === "starter";
    const shouldMarkExplicitUserEdits =
        args.mutationType === "user-content" || args.mutationType === "user-structure";
    const shouldMarkSavedHydration =
        args.origin === "saved" && !shouldMarkExplicitUserEdits;

    for (const [path] of incomingFiles) {
        const current = next[path];
        const preserveUserEdited =
            current?.hasUserEdited === true &&
            normalizeGenerationValue(current.generation) === args.generation &&
            !shouldClearUserEdited;

        next[path] = {
            generation: args.generation,
            origin: args.origin,
            hasUserEdited: preserveUserEdited,
        };
    }

    if (shouldMarkExplicitUserEdits && changedPaths.size > 0) {
        for (const path of changedPaths) {
            next[path] = {
                generation: args.generation,
                origin: args.origin,
                hasUserEdited: true,
            };
        }
        return next;
    }

    if (shouldMarkSavedHydration) {
        const existingFiles = runtimeFileMap(args.existingWorkspace);
        for (const [path, incomingFile] of incomingFiles) {
            const existingFile = existingFiles.get(path);
            const incomingContent = String(incomingFile?.content ?? "");
            const existingContent = String(existingFile?.content ?? "");
            if (existingFile && incomingContent === existingContent) continue;

            next[path] = {
                generation: args.generation,
                origin: args.origin,
                hasUserEdited: true,
            };
        }
    }

    return next;
}

function repairUntouchedBlankRuntimeFiles(args: {
    incomingWorkspace: WorkspaceStateV2 | null | undefined;
    existingWorkspace: WorkspaceStateV2 | null | undefined;
    starterWorkspace: WorkspaceStateV2 | null | undefined;
    fileEditState: RuntimeFileEditState | null | undefined;
    generation: number;
    preserveIncomingBlankPaths?: readonly string[];
}) {
    const incoming = args.incomingWorkspace;
    if (!incoming || incoming.version !== 2 || !Array.isArray(incoming.nodes)) {
        return incoming ?? null;
    }

    const incomingFiles = runtimeFileMap(incoming);
    const existingFiles = runtimeFileMap(args.existingWorkspace);
    const starterFiles = runtimeFileMap(args.starterWorkspace);
    const preserveIncomingBlankPaths = new Set(
        args.preserveIncomingBlankPaths ?? [],
    );
    const allPaths = new Set<string>([
        ...incomingFiles.keys(),
        ...existingFiles.keys(),
        ...starterFiles.keys(),
    ]);

    let nextWorkspace: WorkspaceStateV2 | null = null;
    const ensureNextWorkspace = () => {
        if (!nextWorkspace) {
            nextWorkspace = cloneRuntimeWorkspace(incoming);
        }
        return nextWorkspace;
    };

    for (const path of allPaths) {
        if (preserveIncomingBlankPaths.has(path)) continue;

        const fileState = args.fileEditState?.[path];
        const wasLearnerEdited =
            fileState?.hasUserEdited === true &&
            normalizeGenerationValue(fileState.generation) === args.generation;
        if (wasLearnerEdited) continue;

        const incomingFile = incomingFiles.get(path);
        const existingFile = existingFiles.get(path);
        const starterFile = starterFiles.get(path);
        const fallbackSource =
            !isBlankRuntimeFileContent(existingFile?.content)
                ? existingFile
                : !isBlankRuntimeFileContent(starterFile?.content)
                    ? starterFile
                    : null;

        if (!fallbackSource) continue;

        if (incomingFile) {
            if (!isBlankRuntimeFileContent(incomingFile.content)) continue;
            const workspace = ensureNextWorkspace();
            const target = runtimeFileMap(workspace).get(path);
            if (!target) continue;
            target.content = String(fallbackSource.content ?? "");
            target.updatedAt = fallbackSource.updatedAt ?? Date.now();
            continue;
        }

        const workspace = ensureNextWorkspace();
        const segments = path.split("/");
        const name = segments.pop() || String(fallbackSource.name ?? "file.txt");
        const parentId = ensureRuntimeFolder({
            workspace,
            folderPath: segments.join("/"),
        });
        const existingIds = new Set(workspace.nodes.map((node: any) => String(node?.id ?? "")));
        let fileId = `file:${path.replace(/\//g, "__")}`;
        let index = 2;
        while (existingIds.has(fileId)) {
            fileId = `file:${path.replace(/\//g, "__")}:${index}`;
            index += 1;
        }
        workspace.nodes.push({
            ...fallbackSource,
            id: fileId,
            name,
            parentId,
            content: String(fallbackSource.content ?? ""),
            createdAt: fallbackSource.createdAt ?? 0,
            updatedAt: fallbackSource.updatedAt ?? Date.now(),
        } as any);
    }

    return nextWorkspace ?? incoming;
}

function runtimeWorkspacePatchSourceType(args: {
    source?: string | null;
    workspaceOrigin?: unknown;
    userEdited?: unknown;
    updateOrigin?: unknown;
    mutation?: RuntimeWorkspaceMutation | null;
}) {
    const mutationType = String(args.mutation?.mutation ?? "").trim().toLowerCase();
    const source = String(
        args.mutation?.source ??
        args.source ??
        args.updateOrigin ??
        "",
    ).trim().toLowerCase();
    const workspaceOrigin = String(args.workspaceOrigin ?? "").trim().toLowerCase();

    if (mutationType === "reset") {
        return "starter" as const;
    }

    if (mutationType === "cache-sync") {
        return "cache" as const;
    }

    if (mutationType === "hydrate") {
        if (workspaceOrigin === "saved") {
            return "saved" as const;
        }
        if (workspaceOrigin === "user") {
            return "learner" as const;
        }
        return "runtime-shell" as const;
    }

    if (mutationType === "runtime-sync") {
        return "runtime-shell" as const;
    }

    if (workspaceOrigin === "saved") {
        return "saved" as const;
    }

    if (args.userEdited === true || workspaceOrigin === "user") {
        return "learner" as const;
    }

    if (source.includes("quiz-practice-hydrate")) {
        return "runtime-shell" as const;
    }

    if (source.includes("review-progress-hydrate")) {
        return "saved" as const;
    }

    if (source.includes("retry-load")) {
        return "cache" as const;
    }

    if (source.includes("authoritative-reset")) {
        return "starter" as const;
    }

    if (
        source === "user" ||
        source.includes("sync-user") ||
        source.includes("patch-user") ||
        source.includes("before-run") ||
        source.includes("emit-upstream") ||
        source.includes("review-tools-bind") ||
        source.includes("quiz-practice-submit") ||
        source.includes("new-generation-learner-edit")
    ) {
        return "learner" as const;
    }

    if (
        source === "user"
    ) {
        return "learner" as const;
    }

    if (workspaceOrigin === "starter" || source.includes("starter")) {
        return "starter" as const;
    }

    return "runtime-shell" as const;
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


function sameResetTopicId(a: unknown, b: unknown) {
    const rawA = String(a ?? "").trim();
    const rawB = String(b ?? "").trim();
    if (!rawA || !rawB) return false;
    return rawA === rawB || normalizeTopicProgressKey(rawA) === normalizeTopicProgressKey(rawB);
}

function sameResetCardId(a: unknown, b: unknown) {
    const rawA = String(a ?? "").trim();
    const rawB = String(b ?? "").trim();
    return Boolean(rawA && rawB && rawA === rawB);
}

function runtimeEntryMatchesTopic(entry: unknown, ownerKey: string, topicId: string) {
    const record = asRecord(entry);
    const parsed = parseRuntimeOwnerKey(ownerKey);
    return sameResetTopicId(record?.topicId, topicId) || sameResetTopicId(parsed.topicId, topicId);
}

function runtimeEntryMatchesCard(entry: unknown, ownerKey: string, topicId: string, cardId: string) {
    if (!runtimeEntryMatchesTopic(entry, ownerKey, topicId)) return false;

    const record = asRecord(entry);
    const parsed = parseRuntimeOwnerKey(ownerKey);

    return (
        sameResetCardId(record?.cardId, cardId) ||
        sameResetCardId(parsed.cardId, cardId)
    );
}

function sameResetExerciseId(a: unknown, b: unknown) {
    const rawA = String(a ?? "").trim();
    const rawB = String(b ?? "").trim();
    if (!rawA || !rawB) return false;

    const finalSegment = (value: string) => {
        const parts = value.split(/[.:/]/).filter(Boolean);
        return parts[parts.length - 1] ?? value;
    };

    return rawA === rawB || finalSegment(rawA) === finalSegment(rawB);
}

function runtimeEntryMatchesExercise(
    entry: unknown,
    ownerKey: string,
    args: Pick<ResetExerciseToStarterArgs, "topicId" | "cardId" | "exerciseId">,
) {
    if (!runtimeEntryMatchesCard(entry, ownerKey, args.topicId, args.cardId)) {
        return false;
    }

    const record = asRecord(entry);
    const parsed = parseRuntimeOwnerKey(ownerKey);

    return (
        sameResetExerciseId(record?.exerciseId, args.exerciseId) ||
        sameResetExerciseId(record?.stableExerciseId, args.exerciseId) ||
        sameResetExerciseId(record?.exerciseKey, args.exerciseId) ||
        sameResetExerciseId(parsed.exerciseId, args.exerciseId)
    );
}

function findResetExerciseTargetEntry(
    registry: ReviewTargetRegistry | null | undefined,
    args: Pick<ResetExerciseToStarterArgs, "topicId" | "cardId" | "exerciseId">,
): ReviewTargetEntry | null {
    if (!registry) return null;

    for (const key of registry.orderedKeys ?? Object.keys(registry.byKey ?? {})) {
        const entry = registry.byKey[key];
        if (!entry) continue;
        if (!sameResetTopicId(entry.topicId, args.topicId)) continue;
        if (!sameResetCardId(entry.cardId, args.cardId)) continue;

        if (
            entry.ownerKind === "exercise" &&
            (
                sameResetExerciseId(entry.exerciseId, args.exerciseId) ||
                sameResetExerciseId(entry.exerciseStateKey, args.exerciseId)
            )
        ) {
            return entry;
        }

        if (
            entry.tryIt &&
            (
                sameResetExerciseId(entry.tryIt.exerciseKey, args.exerciseId) ||
                sameResetExerciseId(entry.tryIt.id, args.exerciseId)
            )
        ) {
            return entry;
        }
    }

    return null;
}

function resolveAuthoritativeResetWorkspace(args: {
    existingExercise: ExerciseRuntimeState | null;
    existingEditor: EditorRuntimeState | null;
    registryEntry: ReviewTargetEntry | null;
    language: string;
}) {
    for (const candidate of [
        args.existingExercise?.starterWorkspace,
        args.existingEditor?.starterWorkspace,
    ]) {
        if (workspaceHasUsableStarterContent(candidate)) {
            return cloneRuntimeWorkspace(candidate!);
        }
    }

    const manifest = asManifestRecord(
        args.registryEntry?.toolManifest ??
        args.registryEntry?.item ??
        args.existingExercise?.manifest ??
        null,
    );

    if (!manifest) return null;

    const resolved = resolveExerciseWorkspace({
        language: args.language || args.registryEntry?.language || "python",
        manifest,
        entry: args.registryEntry,
    });

    return workspaceHasUsableStarterContent(resolved)
        ? cloneRuntimeWorkspace(resolved)
        : null;
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

function isPassiveEnsureRuntimeState(value: Partial<ExerciseRuntimeState> | null | undefined) {
    if (!value) return false;

    if ((value.result as any)?.ok === true || (value as any).correct === true || value.status === "completed") {
        return false;
    }

    if (value.userEdited === true) return false;

    const origin = String(value.workspaceOrigin ?? "").trim().toLowerCase();
    return (
        !origin ||
        origin === "starter" ||
        origin === "manifest" ||
        origin === "default" ||
        origin === "empty" ||
        origin === "seed"
    );
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

function findCardAuthoredExerciseEntry(
    registry: ReviewTargetRegistry | null | undefined,
    target: ReviewResolvedRouteTarget | null | undefined,
): ReviewTargetEntry | null {
    if (!registry || !target || target.kind !== "card") return null;

    const sectionSlug = String(target.sectionSlug ?? "").trim();
    const topicId = String(target.topicId ?? "").trim();
    const topicSlug = String(target.topicSlug ?? "").trim();
    const cardId = String(target.cardId ?? "").trim();

    if (!cardId) return null;

    for (const key of registry.orderedKeys ?? []) {
        const entry = registry.byKey[key];
        if (!entry) continue;
        if (entry.ownerKind !== "exercise") continue;
        if (!entry.exerciseStateKey) continue;
        if (entry.cardId !== cardId) continue;
        if (sectionSlug && entry.sectionSlug !== sectionSlug) continue;
        if (topicId && entry.topicId !== topicId) continue;
        if (topicSlug && entry.topicSlug !== topicSlug) continue;
        return entry;
    }

    return null;
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
     * Saved states explicitly marked as starter/empty are not learner work.
     */
    if (
        args.savedState?.workspaceOrigin === "starter" ||
        args.savedState?.workspaceOrigin === "empty" ||
        args.savedState?.userEdited === false
    ) {
        return false;
    }

    const savedIsUserWorkspaceState = isUserWorkspaceState(args.savedState);

    /**
     * If the curriculum starter changed, reject passive/legacy starter snapshots,
     * but do not reject explicit learner-owned work. Learner code must survive
     * starter regeneration and course republish.
     */
    if (
        savedStarterHash &&
        currentStarterHash &&
        savedStarterHash !== currentStarterHash &&
        !savedIsUserWorkspaceState
    ) {
        return false;
    }

    if (savedIsUserWorkspaceState) {
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
    resetRevision: 0,
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
                ...(existing ?? {}),
                exerciseKey,
                starterWorkspace:
                    resolvedWorkspace.source === "manifest"
                        ? selectedWorkspace
                        : existing?.starterWorkspace ?? selectedWorkspace ?? null,
                fileEditState:
                    resolvedWorkspace.source === "manifest"
                        ? buildRuntimeFileEditState({
                            workspace: selectedWorkspace,
                            generation: state.resetRevision,
                            origin: "starter",
                            hasUserEdited: false,
                        })
                        : existing?.fileEditState ?? {},
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
                workspaceGeneration: state.resetRevision,
                starterHash,
                ideConfig: (manifest as any)?.ideConfig ?? existing?.ideConfig ?? null,
                manifest: (manifest as Record<string, unknown> | null) ?? existing?.manifest ?? null,
                updatedAt: existing?.updatedAt ?? Date.now(),
            };

            const passiveOwnershipEquivalent = Boolean(
                existing &&
                isPassiveEnsureRuntimeState(existing) &&
                isPassiveEnsureRuntimeState(nextExercise)
            );

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
                (
                    passiveOwnershipEquivalent ||
                    existing.workspaceOrigin === nextExercise.workspaceOrigin
                ) &&
                (
                    passiveOwnershipEquivalent ||
                    Boolean(existing.userEdited) === Boolean(nextExercise.userEdited)
                ) &&
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
            const workspaceMutation = normalizeRuntimeWorkspaceMutation({
                generation: (patch as { generation?: number } | undefined)?.generation,
                source: (patch as { updateOrigin?: string } | undefined)?.updateOrigin,
                mutation: (patch as { workspaceMutation?: RuntimeWorkspaceMutation } | undefined)?.workspaceMutation ?? null,
            });
            const incomingGeneration =
                workspaceMutation?.generation ??
                (patch as { generation?: number } | undefined)?.generation;
            const explicitPatchWorkspace =
                isWorkspace(patch.workspace)
                    ? patch.workspace
                    : isWorkspace(patch.codeWorkspace)
                        ? patch.codeWorkspace
                        : isWorkspace(patch.ideWorkspace)
                            ? patch.ideWorkspace
                            : null;
            if (patchCarriesWorkspaceState(patch) && typeof incomingGeneration !== "number") {
                reviewSaveDebug("runtime patchExercise rejected missing generation", {
                    exerciseKey: key,
                    activeGeneration: state.resetRevision,
                    updateOrigin: patch.updateOrigin,
                    patchKeys: Object.keys(patch ?? {}),
                    workspace: summarizeWorkspaceForSave(explicitPatchWorkspace),
                });
                return state;
            }
            if (isStaleWorkspaceGeneration(incomingGeneration, state.resetRevision)) {
                reviewSaveDebug("runtime patchExercise rejected stale generation", {
                    exerciseKey: key,
                    incomingGeneration,
                    activeGeneration: state.resetRevision,
                    patchKeys: Object.keys(patch ?? {}),
                    workspace: summarizeWorkspaceForSave(
                        isWorkspace(patch.workspace)
                            ? patch.workspace
                            : isWorkspace(patch.codeWorkspace)
                                ? patch.codeWorkspace
                                : isWorkspace(patch.ideWorkspace)
                                    ? patch.ideWorkspace
                                    : null,
                    ),
                });
                return state;
            }
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
            const patchSourceType = runtimeWorkspacePatchSourceType({
                mutation: workspaceMutation,
                source:
                    typeof effectivePatch.updateOrigin === "string"
                        ? effectivePatch.updateOrigin
                        : undefined,
                workspaceOrigin: effectivePatch.workspaceOrigin,
                userEdited: effectivePatch.userEdited,
                updateOrigin: effectivePatch.updateOrigin,
            });
            const shouldPreserveExistingMissingFiles =
                !(
                    effectivePatch.userEdited === true ||
                    effectivePatch.workspaceOrigin === "user" ||
                    effectivePatch.workspaceOrigin === "saved" ||
                    effectivePatch.updateOrigin === "user" ||
                    effectivePatch.dismissFeedbackOnEdit === true
                );
            const mergedIncomingWorkspaceBase =
                shouldPreserveExistingMissingFiles && incomingWorkspace && existing?.workspace
                    ? mergeMissingFilesFromWorkspace(incomingWorkspace, existing.workspace)
                    : incomingWorkspace;
            const nextWorkspaceGenerationForPatch = resolveWorkspaceGeneration(
                incomingGeneration,
                existing?.workspaceGeneration ?? state.resetRevision,
            );
            const explicitChangedFilePaths =
                workspaceMutation?.changedFilePaths ?? [];
            const shouldRepairUntouchedBlankFiles =
                patchSourceType !== "saved" &&
                (
                    patchSourceType !== "learner" ||
                    explicitChangedFilePaths.length > 0
                );
            const mergedIncomingWorkspace = shouldRepairUntouchedBlankFiles
                ? repairUntouchedBlankRuntimeFiles({
                    incomingWorkspace: mergedIncomingWorkspaceBase,
                    existingWorkspace: existing?.workspace ?? null,
                    starterWorkspace: existing?.starterWorkspace ?? null,
                    fileEditState: existing?.fileEditState ?? null,
                    generation: nextWorkspaceGenerationForPatch,
                    preserveIncomingBlankPaths:
                        patchSourceType === "learner"
                            ? explicitChangedFilePaths
                            : undefined,
                })
                : mergedIncomingWorkspaceBase;

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
                effectivePatch.workspaceOrigin === "saved"
                    ? "saved"
                    : effectivePatch.userEdited === true || effectivePatch.workspaceOrigin === "user"
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
            const nextWorkspaceGeneration = nextWorkspaceGenerationForPatch;
            const nextFileEditState = patchHasWorkspace || mergedIncomingWorkspace
                ? mergeRuntimeFileEditState({
                    existing: existing?.fileEditState ?? null,
                    existingWorkspace: existing?.workspace ?? null,
                    incomingWorkspace: mergedIncomingWorkspace,
                    generation: nextWorkspaceGeneration,
                    origin: patchSourceType,
                    mutationType: workspaceMutation?.mutation ?? null,
                    changedFilePaths: workspaceMutation?.changedFilePaths,
                })
                : existing?.fileEditState ?? {};

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
            const existingWorkspaceStatus = String(existing?.workspaceStatus ?? "");
            const nextWorkspaceStatus = String((effectivePatch as any).workspaceStatus ?? existing?.workspaceStatus ?? "ready");
            const existingWorkspaceError = String((existing as any)?.workspaceError ?? "");
            const nextWorkspaceError = Object.prototype.hasOwnProperty.call(effectivePatch, "workspaceError")
                ? String((effectivePatch as any).workspaceError ?? "")
                : existingWorkspaceError;
            const hasPatchField = (field: string) =>
                Object.prototype.hasOwnProperty.call(effectivePatch, field);
            const existingRuntimeConfigKey = stableContentKey({
                ideConfig: existing?.ideConfig ?? null,
                fixedSqlDialect: existing?.fixedSqlDialect ?? null,
                sqlDialect: existing?.sqlDialect ?? null,
                sqlDatasetId: existing?.sqlDatasetId ?? null,
                sqlDatasetResolutionSource:
                    existing?.sqlDatasetResolutionSource ?? null,
                sqlDatasetResolutionError:
                    existing?.sqlDatasetResolutionError ?? null,
                sqlSchemaSql: existing?.sqlSchemaSql ?? null,
                sqlSeedSql: existing?.sqlSeedSql ?? null,
                sqlInitialTableSnapshots:
                    existing?.sqlInitialTableSnapshots ?? null,
                runtime: existing?.runtime ?? null,
            });
            const nextRuntimeConfigKey = stableContentKey({
                ideConfig: hasPatchField("ideConfig")
                    ? effectivePatch.ideConfig
                    : existing?.ideConfig ?? null,
                fixedSqlDialect: hasPatchField("fixedSqlDialect")
                    ? effectivePatch.fixedSqlDialect
                    : existing?.fixedSqlDialect ?? null,
                sqlDialect: hasPatchField("sqlDialect")
                    ? effectivePatch.sqlDialect
                    : existing?.sqlDialect ?? null,
                sqlDatasetId: hasPatchField("sqlDatasetId")
                    ? effectivePatch.sqlDatasetId
                    : existing?.sqlDatasetId ?? null,
                sqlDatasetResolutionSource: hasPatchField(
                    "sqlDatasetResolutionSource",
                )
                    ? effectivePatch.sqlDatasetResolutionSource
                    : existing?.sqlDatasetResolutionSource ?? null,
                sqlDatasetResolutionError: hasPatchField(
                    "sqlDatasetResolutionError",
                )
                    ? effectivePatch.sqlDatasetResolutionError
                    : existing?.sqlDatasetResolutionError ?? null,
                sqlSchemaSql: hasPatchField("sqlSchemaSql")
                    ? effectivePatch.sqlSchemaSql
                    : existing?.sqlSchemaSql ?? null,
                sqlSeedSql: hasPatchField("sqlSeedSql")
                    ? effectivePatch.sqlSeedSql
                    : existing?.sqlSeedSql ?? null,
                sqlInitialTableSnapshots: hasPatchField(
                    "sqlInitialTableSnapshots",
                )
                    ? effectivePatch.sqlInitialTableSnapshots
                    : existing?.sqlInitialTableSnapshots ?? null,
                runtime: hasPatchField("runtime")
                    ? effectivePatch.runtime
                    : existing?.runtime ?? null,
            });

            const noMeaningfulChange = Boolean(
                existing &&
                existingWorkspaceKey === nextWorkspaceKey &&
                existingTerminalEvidenceKey === nextTerminalEvidenceKey &&
                existingCode === nextCode &&
                existingStdin === nextStdin &&
                existingLanguage === nextLanguageComparable &&
                existingWorkspaceStatus === nextWorkspaceStatus &&
                existingWorkspaceError === nextWorkspaceError &&
                existingRuntimeConfigKey === nextRuntimeConfigKey &&
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
                existingWorkspaceStatus,
                nextWorkspaceStatus,
                existingWorkspaceError,
                nextWorkspaceError,
                existingRuntimeConfigKey,
                nextRuntimeConfigKey,
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
                workspaceGeneration: nextWorkspaceGeneration,
                fileEditState: nextFileEditState,
                starterWorkspace: existing?.starterWorkspace ?? workspace ?? null,
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
                workspaceGeneration: nextWorkspaceGeneration,
                fileEditState: nextFileEditState,
                starterWorkspace: existing?.starterWorkspace ?? workspace ?? null,
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
                starterWorkspace:
                    resolvedTool.workspaceSeedMode === "starter"
                        ? resolvedTool.workspace
                        : existing?.starterWorkspace ?? resolvedTool.workspace ?? null,
                fileEditState:
                    resolvedTool.workspaceSeedMode === "starter"
                        ? buildRuntimeFileEditState({
                            workspace: resolvedTool.workspace,
                            generation: state.resetRevision,
                            origin: "starter",
                            hasUserEdited: false,
                        })
                        : existing?.fileEditState ?? {},
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
                workspaceGeneration: state.resetRevision,
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
        set((state) => {
            const activeMatches = Boolean(
                state.activeExerciseKey &&
                runtimeEntryMatchesTopic(
                    state.exercises[state.activeExerciseKey],
                    state.activeExerciseKey,
                    topicId,
                ),
            );

            const boundExerciseMatches = Boolean(
                state.tool.boundExerciseKey &&
                runtimeEntryMatchesTopic(
                    state.exercises[state.tool.boundExerciseKey],
                    state.tool.boundExerciseKey,
                    topicId,
                ),
            );

            return {
                resetRevision: state.resetRevision + 1,
                activeExerciseKey: activeMatches ? null : state.activeExerciseKey,
                boundToolWorkspace: activeMatches ? null : state.boundToolWorkspace,

                exercises: Object.fromEntries(
                    Object.entries(state.exercises).filter(([key, value]) => {
                        return !runtimeEntryMatchesTopic(value, key, topicId);
                    }),
                ),

                cards: Object.fromEntries(
                    Object.entries(state.cards).filter(([key, value]) => {
                        return !runtimeEntryMatchesTopic(value, key, topicId);
                    }),
                ),

                editorRuntimes: Object.fromEntries(
                    Object.entries(state.editorRuntimes).filter(([key, value]) => {
                        const ownerKey = String((value as {ownerKey?: string} | undefined)?.ownerKey ?? key);
                        return !runtimeEntryMatchesTopic(value, ownerKey, topicId);
                    }),
                ),

                tool: {
                    ...state.tool,
                    boundExerciseKey: boundExerciseMatches ? null : state.tool.boundExerciseKey,
                },
                persistence: {
                    dirty: false,
                    pendingExerciseKeys: new Set(),
                    pendingCardKeys: new Set(),
                },
            };
        });
    },

    clearRuntimeForCard: (topicId, cardId) => {
        set((state) => {
            const activeMatches = Boolean(
                state.activeExerciseKey &&
                runtimeEntryMatchesCard(
                    state.exercises[state.activeExerciseKey],
                    state.activeExerciseKey,
                    topicId,
                    cardId,
                ),
            );

            const boundExerciseMatches = Boolean(
                state.tool.boundExerciseKey &&
                runtimeEntryMatchesCard(
                    state.exercises[state.tool.boundExerciseKey],
                    state.tool.boundExerciseKey,
                    topicId,
                    cardId,
                ),
            );

            return {
                resetRevision: state.resetRevision + 1,
                activeExerciseKey: activeMatches ? null : state.activeExerciseKey,
                boundToolWorkspace: activeMatches ? null : state.boundToolWorkspace,

                exercises: Object.fromEntries(
                    Object.entries(state.exercises).filter(([key, value]) => {
                        return !runtimeEntryMatchesCard(value, key, topicId, cardId);
                    }),
                ),

                cards: Object.fromEntries(
                    Object.entries(state.cards).filter(([key, value]) => {
                        return !runtimeEntryMatchesCard(value, key, topicId, cardId);
                    }),
                ),

                editorRuntimes: Object.fromEntries(
                    Object.entries(state.editorRuntimes).filter(([key, value]) => {
                        const ownerKey = String((value as {ownerKey?: string} | undefined)?.ownerKey ?? key);
                        return !runtimeEntryMatchesCard(value, ownerKey, topicId, cardId);
                    }),
                ),

                tool: {
                    ...state.tool,
                    boundExerciseKey: boundExerciseMatches ? null : state.tool.boundExerciseKey,
                },
                persistence: {
                    dirty: false,
                    pendingExerciseKeys: new Set(),
                    pendingCardKeys: new Set(),
                },
            };
        });
    },

    resetExerciseToStarter: (args) => {
        let result: ResetExerciseToStarterResult = {
            exerciseKey: null,
            resetRevision: get().resetRevision,
            restored: false,
        };

        set((state) => {
            const nextResetRevision = state.resetRevision + 1;
            const normalizedArgs: ResetExerciseToStarterArgs = {
                topicId: String(args.topicId ?? "").trim(),
                cardId: String(args.cardId ?? "").trim(),
                exerciseId: String(args.exerciseId ?? "").trim(),
                exerciseStateKey:
                    typeof args.exerciseStateKey === "string" &&
                    args.exerciseStateKey.trim()
                        ? args.exerciseStateKey.trim()
                        : null,
            };

            const matchingExerciseEntry = Object.entries(state.exercises).find(
                ([key, value]) =>
                    runtimeEntryMatchesExercise(value, key, normalizedArgs),
            );
            const registryEntry = findResetExerciseTargetEntry(
                state.targetRegistry,
                normalizedArgs,
            );
            const exerciseKey =
                normalizedArgs.exerciseStateKey ??
                matchingExerciseEntry?.[0] ??
                registryEntry?.exerciseStateKey ??
                getExerciseStateKey(
                    {
                        subjectSlug: state.subjectSlug,
                        moduleSlug: state.moduleSlug,
                        sectionSlug:
                            registryEntry?.sectionSlug ?? state.sectionSlug,
                        topicId: normalizedArgs.topicId,
                        cardId: normalizedArgs.cardId,
                    },
                    normalizedArgs.exerciseId,
                );

            const existingExercise =
                state.exercises[exerciseKey] ??
                matchingExerciseEntry?.[1] ??
                null;
            const existingEditor =
                state.editorRuntimes[exerciseKey] ??
                (
                    matchingExerciseEntry
                        ? state.editorRuntimes[matchingExerciseEntry[0]] ?? null
                        : null
                );
            const manifest = asManifestRecord(
                registryEntry?.toolManifest ??
                registryEntry?.item ??
                existingExercise?.manifest ??
                null,
            );
            const language = resolveCourseLanguage({
                subjectSlug:
                    existingExercise?.subjectSlug ??
                    state.subjectSlug ??
                    "",
                language:
                    existingExercise?.language ??
                    existingExercise?.lang ??
                    registryEntry?.language ??
                    workspaceLanguage(existingExercise?.starterWorkspace) ??
                    "python",
                runtimeDefaults:
                    registryEntry?.runtimeDefaults ??
                    registryEntry?.topicRuntimeDefaults ??
                    registryEntry?.moduleRuntimeDefaults ??
                    null,
                target: manifest ?? registryEntry?.item ?? null,
            });
            const starterWorkspace = resolveAuthoritativeResetWorkspace({
                existingExercise,
                existingEditor,
                registryEntry,
                language,
            });

            const nextExercises = Object.fromEntries(
                Object.entries(state.exercises).filter(([key, value]) => {
                    return !runtimeEntryMatchesExercise(
                        value,
                        key,
                        normalizedArgs,
                    );
                }),
            );
            const nextEditorRuntimes = Object.fromEntries(
                Object.entries(state.editorRuntimes).filter(([key, value]) => {
                    const ownerKey = String(
                        (value as { ownerKey?: string } | undefined)?.ownerKey ?? key,
                    );
                    return !runtimeEntryMatchesExercise(
                        value,
                        ownerKey,
                        normalizedArgs,
                    );
                }),
            );
            const nextCards = Object.fromEntries(
                Object.entries(state.cards).filter(([key, value]) => {
                    return !runtimeEntryMatchesCard(
                        value,
                        key,
                        normalizedArgs.topicId,
                        normalizedArgs.cardId,
                    );
                }),
            );

            if (!starterWorkspace) {
                result = {
                    exerciseKey,
                    resetRevision: nextResetRevision,
                    restored: false,
                };

                return {
                    resetRevision: nextResetRevision,
                    activeExerciseKey:
                        state.activeExerciseKey &&
                        runtimeEntryMatchesExercise(
                            state.exercises[state.activeExerciseKey],
                            state.activeExerciseKey,
                            normalizedArgs,
                        )
                            ? null
                            : state.activeExerciseKey,
                    boundToolWorkspace: null,
                    exercises: nextExercises,
                    cards: nextCards,
                    editorRuntimes: nextEditorRuntimes,
                    tool: {
                        ...state.tool,
                        boundExerciseKey: null,
                    },
                    persistence: {
                        dirty: false,
                        pendingExerciseKeys: new Set(),
                        pendingCardKeys: new Set(),
                    },
                };
            }

            const workspace = cloneRuntimeWorkspace(starterWorkspace);
            const starterSnapshot = cloneRuntimeWorkspace(starterWorkspace);
            const code = deriveCodeFromWorkspace(workspace);
            const stdin =
                typeof workspace.stdin === "string" ? workspace.stdin : "";
            const now = Date.now();
            const fileEditState = buildRuntimeFileEditState({
                workspace,
                generation: nextResetRevision,
                origin: "starter",
                hasUserEdited: false,
            });
            const subjectSlug =
                existingExercise?.subjectSlug ?? state.subjectSlug ?? "unknown";
            const moduleSlug =
                existingExercise?.moduleSlug ?? state.moduleSlug ?? "unknown";
            const sectionSlug =
                existingExercise?.sectionSlug ??
                registryEntry?.sectionSlug ??
                state.sectionSlug ??
                undefined;

            const resetExercise: ExerciseRuntimeState = {
                ...(existingExercise ?? {}),
                exerciseKey,
                subjectSlug,
                moduleSlug,
                sectionSlug,
                topicId: normalizedArgs.topicId,
                cardId: normalizedArgs.cardId,
                exerciseId: normalizedArgs.exerciseId,
                language: language as WorkspaceStateV2["language"],
                lang: language as WorkspaceStateV2["language"],
                codeLang: language as WorkspaceStateV2["language"],
                workspace,
                codeWorkspace: workspace,
                ideWorkspace: workspace,
                starterWorkspace: starterSnapshot,
                fileEditState,
                workspaceGeneration: nextResetRevision,
                workspaceStatus: "ready",
                workspaceOrigin: "starter",
                userEdited: false,
                code,
                source: code,
                stdin,
                codeStdin: stdin,
                runner: {},
                answer: { revealed: false },
                terminalEvidence: undefined,
                status: "in_progress",
                submitted: false,
                result: undefined,
                workspaceError: null,
                manifest:
                    manifest ??
                    existingExercise?.manifest ??
                    null,
                ideConfig:
                    (manifest?.ideConfig as ExerciseRuntimeState["ideConfig"]) ??
                    existingExercise?.ideConfig ??
                    null,
                updatedAt: now,
            };

            const resetEditor: EditorRuntimeState = {
                ...(existingEditor ?? {}),
                ownerKey: exerciseKey,
                ownerKind: "exercise",
                targetKey:
                    existingEditor?.targetKey ??
                    registryEntry?.targetKey ??
                    `exercise:${exerciseKey}`,
                toolScopeKey:
                    existingEditor?.toolScopeKey ??
                    registryEntry?.toolScopeKey ??
                    exerciseKey,
                language: language as WorkspaceStateV2["language"],
                workspaceStatus: "ready",
                workspaceSeedMode: "starter",
                workspaceOrigin: "starter",
                userEdited: false,
                workspaceGeneration: nextResetRevision,
                starterWorkspace: cloneRuntimeWorkspace(starterSnapshot),
                fileEditState: { ...fileEditState },
                workspace: cloneRuntimeWorkspace(workspace),
                code,
                stdin,
                terminalEvidence: undefined,
                updatedAt: now,
            };

            nextExercises[exerciseKey] = resetExercise;
            nextEditorRuntimes[exerciseKey] = resetEditor;

            result = {
                exerciseKey,
                resetRevision: nextResetRevision,
                restored: true,
            };

            reviewSaveDebug("runtime authoritative exercise reset", {
                exerciseKey,
                topicId: normalizedArgs.topicId,
                cardId: normalizedArgs.cardId,
                exerciseId: normalizedArgs.exerciseId,
                resetRevision: nextResetRevision,
                restored: true,
                workspace: summarizeWorkspaceForSave(workspace),
            });

            return {
                resetRevision: nextResetRevision,
                activeExerciseKey: exerciseKey,
                boundToolWorkspace: cloneRuntimeWorkspace(workspace),
                exercises: nextExercises,
                cards: nextCards,
                editorRuntimes: nextEditorRuntimes,
                tool: {
                    ...state.tool,
                    boundExerciseKey: exerciseKey,
                },
                persistence: {
                    dirty: false,
                    pendingExerciseKeys: new Set(),
                    pendingCardKeys: new Set(),
                },
            };
        });

        return result;
    },

    clearRuntimeForModule: () => {
        set((state) => ({
            resetRevision: state.resetRevision + 1,
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
        }));
    },
    patchCard: (key, patch) => {
        let didPatch = false;

        set((state) => {
            const existing = state.cards[key];
            const incomingGeneration = patch?.generation;
            if (isStaleWorkspaceGeneration(incomingGeneration, state.resetRevision)) {
                reviewSaveDebug("runtime patchCard rejected stale generation", {
                    cardKey: key,
                    incomingGeneration,
                    activeGeneration: state.resetRevision,
                    patchKeys: Object.keys(patch ?? {}),
                    workspace: summarizeWorkspaceForSave(patch?.toolWorkspace ?? null),
                });
                return state;
            }
            const nextWorkspaceGeneration = resolveWorkspaceGeneration(
                incomingGeneration,
                existing?.workspaceGeneration ?? state.resetRevision,
            );

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
                workspaceGeneration: existing?.workspaceGeneration ?? state.resetRevision,
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
                workspaceGeneration: nextWorkspaceGeneration,
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
                workspaceGeneration: state.resetRevision,
                starterWorkspace:
                    resolved.workspaceSeedMode === "starter"
                        ? resolved.workspace
                        : existing?.starterWorkspace ?? resolved.workspace ?? null,
                fileEditState:
                    resolved.workspaceSeedMode === "starter"
                        ? buildRuntimeFileEditState({
                            workspace: resolved.workspace,
                            generation: state.resetRevision,
                            origin: "starter",
                            hasUserEdited: false,
                        })
                        : existing?.fileEditState ?? {},
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

    patchEditorWorkspace: (ownerKey, workspace, options) => {
        let didPatch = false;

        set((state) => {
            const existing = state.editorRuntimes[ownerKey];
            if (!existing) return state;
            const workspaceMutation = normalizeRuntimeWorkspaceMutation({
                generation: options?.generation,
                source: options?.source,
                mutation: options?.mutation ?? null,
            });
            const incomingGeneration = workspaceMutation?.generation ?? options?.generation;
            if (workspace && typeof incomingGeneration !== "number") {
                reviewSaveDebug("runtime patchEditorWorkspace rejected missing generation", {
                    ownerKey,
                    source: options?.source ?? null,
                    activeGeneration: state.resetRevision,
                    workspace: summarizeWorkspaceForSave(workspace),
                });
                return state;
            }
            if (isStaleWorkspaceGeneration(incomingGeneration, state.resetRevision)) {
                reviewSaveDebug("runtime patchEditorWorkspace rejected stale generation", {
                    ownerKey,
                    source: options?.source ?? null,
                    incomingGeneration,
                    activeGeneration: state.resetRevision,
                    workspace: summarizeWorkspaceForSave(workspace),
                });
                return state;
            }
            const patchSourceType = runtimeWorkspacePatchSourceType({
                mutation: workspaceMutation,
                source: options?.source,
                workspaceOrigin: workspaceMutation ? undefined : existing.workspaceOrigin,
                userEdited: workspaceMutation ? undefined : existing.userEdited,
            });
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

            const nextWorkspaceGeneration = resolveWorkspaceGeneration(
                incomingGeneration,
                existing.workspaceGeneration ?? state.resetRevision,
            );
            const explicitChangedFilePaths =
                workspaceMutation?.changedFilePaths ?? [];
            const shouldRepairUntouchedBlankFiles =
                patchSourceType !== "saved" &&
                (
                    patchSourceType !== "learner" ||
                    explicitChangedFilePaths.length > 0
                );
            const reconciledWorkspace = shouldRepairUntouchedBlankFiles
                ? repairUntouchedBlankRuntimeFiles({
                    incomingWorkspace: workspace,
                    existingWorkspace: existing.workspace ?? null,
                    starterWorkspace:
                        existing.starterWorkspace ??
                        existingExercise?.starterWorkspace ??
                        null,
                    fileEditState:
                        existing.fileEditState ??
                        existingExercise?.fileEditState ??
                        null,
                    generation: nextWorkspaceGeneration,
                    preserveIncomingBlankPaths:
                        patchSourceType === "learner"
                            ? explicitChangedFilePaths
                            : undefined,
                })
                : workspace;
            const nextCode = deriveCodeFromWorkspace(reconciledWorkspace) ?? "";
            const nextStdin =
                typeof reconciledWorkspace?.stdin === "string"
                    ? reconciledWorkspace.stdin
                    : existing.stdin ?? "";
            const nextWorkspaceKey = workspaceContentKey(reconciledWorkspace ?? null);
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
                workspaceGeneration: nextWorkspaceGeneration,
                workspace: reconciledWorkspace,
                code: nextCode,
                stdin: nextStdin,
                workspaceStatus: reconciledWorkspace ? "ready" : "pending",
                workspaceSeedMode: reconciledWorkspace ? "restored" : existing.workspaceSeedMode,
                workspaceOrigin:
                    reconciledWorkspace
                        ? patchSourceType === "learner"
                            ? "user"
                            : patchSourceType === "saved"
                                ? "saved"
                            : existing.workspaceOrigin
                        : existing.workspaceOrigin,
                userEdited:
                    reconciledWorkspace
                        ? patchSourceType === "learner" || patchSourceType === "saved"
                            ? true
                            : existing.userEdited
                        : existing.userEdited,
                fileEditState: mergeRuntimeFileEditState({
                    existing: existing.fileEditState ?? null,
                    existingWorkspace: existing.workspace ?? null,
                    incomingWorkspace: reconciledWorkspace,
                    generation: nextWorkspaceGeneration,
                    origin: patchSourceType,
                    mutationType: workspaceMutation?.mutation ?? null,
                    changedFilePaths: workspaceMutation?.changedFilePaths,
                }),
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
            const nextExerciseWorkspace = reconciledWorkspace ?? null;
            const nextCardWorkspace = reconciledWorkspace ?? null;

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
                const ex: ExerciseRuntimeState | null = state.exercises[ownerKey] ?? null;
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
                    workspaceStatus: nextExerciseWorkspace ? "ready" : "pending",
                    workspaceOrigin:
                        nextExerciseWorkspace
                            ? nextEditorRuntime.workspaceOrigin
                            : existing.workspaceOrigin,
                    userEdited:
                        nextExerciseWorkspace
                            ? nextEditorRuntime.userEdited
                            : existing.userEdited,
                    workspaceGeneration:
                        existing.workspaceGeneration ?? state.resetRevision,
                    fileEditState: existing.fileEditState ?? {},
                    starterWorkspace:
                        existing.starterWorkspace ??
                        nextExerciseWorkspace,
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
                        workspaceOrigin:
                            nextExerciseWorkspace
                                ? nextEditorRuntime.workspaceOrigin ?? baseExercise.workspaceOrigin
                                : baseExercise.workspaceOrigin,
                        userEdited:
                            nextExerciseWorkspace
                                ? nextEditorRuntime.userEdited ?? baseExercise.userEdited
                                : baseExercise.userEdited,
                        workspaceGeneration: nextEditorRuntime.workspaceGeneration,
                        fileEditState: nextEditorRuntime.fileEditState,
                        starterWorkspace:
                            baseExercise.starterWorkspace ??
                            existing.starterWorkspace ??
                            nextExerciseWorkspace,
                        starterHash: baseExercise.starterHash ?? existing.starterHash,
                        status: baseExercise.status === "not_started" ? "in_progress" : baseExercise.status,
                        updatedAt: now,
                    },
                };
                nextPendingExerciseKeys.add(ownerKey);
                persistenceDirty = true;
            } else {
                const card: CardRuntimeState | null = state.cards[ownerKey] ?? null;
                const parsed = parseRuntimeOwnerKey(ownerKey);
                const baseCard: CardRuntimeState = card ?? {
                    cardKey: ownerKey,
                    topicId: parsed.topicId,
                    cardId: parsed.cardId,
                    visited: true,
                    completed: false,
                    sketch: null,
                    workspaceStatus: nextCardWorkspace ? "ready" : "pending",
                    workspaceSeedMode: nextCardWorkspace ? "restored" : existing.workspaceSeedMode,
                    workspaceOrigin:
                        nextCardWorkspace
                            ? nextEditorRuntime.workspaceOrigin
                            : existing.workspaceOrigin,
                    userEdited:
                        nextCardWorkspace
                            ? nextEditorRuntime.userEdited
                            : existing.userEdited,
                    workspaceGeneration:
                        existing.workspaceGeneration ?? state.resetRevision,
                    fileEditState: existing.fileEditState ?? {},
                    starterWorkspace:
                        existing.starterWorkspace ??
                        nextCardWorkspace,
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
                        workspaceOrigin:
                            nextCardWorkspace
                                ? nextEditorRuntime.workspaceOrigin ?? baseCard.workspaceOrigin
                                : baseCard.workspaceOrigin,
                        userEdited:
                            nextCardWorkspace
                                ? nextEditorRuntime.userEdited ?? baseCard.userEdited
                                : baseCard.userEdited,
                        workspaceGeneration: nextEditorRuntime.workspaceGeneration,
                        fileEditState: nextEditorRuntime.fileEditState,
                        starterWorkspace:
                            baseCard.starterWorkspace ??
                            existing.starterWorkspace ??
                            nextCardWorkspace,
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
        const generation = get().resetRevision;
        const activeNode = workspace.nodes.find(
            (node) => node.kind === "file" && node.id === workspace.activeFileId,
        );
        const activePath = activeNode
            ? runtimePathForNode(workspace.nodes as any[], activeNode as any)
            : "";

        get().patchExercise(key, {
            ...normalized,
            generation,
            updateOrigin: "user",
            workspaceMutation: {
                generation,
                source: "patch-bound-tool-workspace",
                mutation: "user-content",
                changedFilePaths: activePath ? [activePath] : undefined,
            },
            userEdited: true,
            workspaceOrigin: "user",
        });
    },

    setFlushToolSnapshotCallback: (cb) => {
        toolSnapshotFlushBridge.current = cb;
    },

    flushToolSnapshot: () => {
        toolSnapshotFlushBridge.current?.();
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

            /**
             * Text/sketch cards may own an embedded authored Try-it exercise.
             * In that case the card route is only the lesson surface; the right rail
             * editor must bind to the embedded exercise owner immediately from the
             * manifest registry. Waiting for the QuizPracticeCard network load to
             * register/bind it produces the broken state seen in dev:
             *
             *   card route /sketch/sketch-1
             *   -> Tools says "Loading exercise..." forever
             *   -> embedded card times out
             *
             * Manifest route registry is the source of truth, so create and bind the
             * child exercise here during route sync. DB/progress can still overlay
             * saved user code later through ensureExercise.
             */
            const embeddedExerciseEntry = findCardAuthoredExerciseEntry(
                targetRegistry,
                target,
            );

            if (embeddedExerciseEntry?.exerciseStateKey) {
                const routeExerciseManifest =
                    buildRouteExerciseManifestFromEntry(embeddedExerciseEntry);

                get().ensureExercise({
                    exerciseKey: embeddedExerciseEntry.exerciseStateKey,
                    subjectSlug: subjectSlug ?? "",
                    moduleSlug: moduleSlug ?? "",
                    sectionSlug: embeddedExerciseEntry.sectionSlug,
                    topicId: embeddedExerciseEntry.topicId,
                    cardId: embeddedExerciseEntry.cardId,
                    manifest: routeExerciseManifest,
                    entry: embeddedExerciseEntry,
                });
                get().bindExerciseTool(embeddedExerciseEntry.exerciseStateKey);
                return;
            }

            // Unbind exercise only for cards that do not expose an authored editor surface.
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
