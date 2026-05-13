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
import {resolveCourseLanguage, resolveCourseSqlRunnerConfig} from "./courseProfiles";
import {resolveDeterministicEditorSource, type ReviewDeterministicEditorSource} from "./deterministicEditorSource";
import {resolveSketchState} from "./sketchResolver";
import {reviewDebug, summarizeWorkspace} from "./reviewDebug";
import {exerciseDebug, summarizeExercisePatch, summarizeExerciseWorkspace} from "./exerciseDebug";
import {reviewSaveDebug, summarizeWorkspaceForSave} from "./reviewSaveDebug";
import {languagesCompatible} from "@/components/review/module/utils";

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

function targetHasStarter(entryOrManifest: any, maybeEntry?: import("./reviewTargetRegistry").ReviewTargetEntry | null) {
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
    const hasFiles = (value: unknown) =>
        Array.isArray(value)
            ? value.length > 0
            : !!value && typeof value === "object" && Object.keys(value as Record<string, unknown>).length > 0;
    const isWorkspaceValue = (value: unknown) =>
        !!value &&
        typeof value === "object" &&
        (value as any).version === 2 &&
        Array.isArray((value as any).nodes);

    return Boolean(
        isWorkspaceValue(source?.initialWorkspace) ||
        isWorkspaceValue(source?.starterWorkspace) ||
        hasFiles(workspace?.starterFiles) ||
        hasFiles(workspace?.initialFiles) ||
        hasFiles(workspace?.workspaceFiles) ||
        String(workspace?.starterCode ?? "").trim() ||
        hasFiles(source?.starterFiles) ||
        hasFiles(source?.initialFiles) ||
        hasFiles(source?.workspaceFiles) ||
        String(source?.starterCode ?? "").trim() ||
        hasFiles(source?.recipe?.starterFiles) ||
        hasFiles(source?.recipe?.initialFiles) ||
        String(source?.recipe?.starterCode ?? "").trim(),
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
        reviewDebug("review-runtime source-selected", {
            key: args.entry?.cardKey ?? args.existing?.cardKey ?? null,
            entryFound: !!args.entry,
            targetKind: args.entry?.targetKind ?? "card",
            starterFilesCount: Array.isArray(args.entry?.starterFiles) ? args.entry.starterFiles.length : 0,
            starterCodeLength: typeof args.entry?.starterCode === "string" ? args.entry.starterCode.length : 0,
            hasStarter,
            workspaceFileCount: workspaceFileCount(args.existing.toolWorkspace),
            workspaceNonEmpty: workspaceHasUsableFile(args.existing.toolWorkspace),
            sourceType: "existing",
        });
        return {
            workspaceStatus: args.existing.workspaceStatus ?? "ready",
            workspaceSeedMode: args.existing.workspaceSeedMode ?? "restored",
            workspaceOrigin: args.existing.workspaceOrigin ?? "saved",
            userEdited: Boolean(args.existing.userEdited ?? isUserWorkspaceState(args.existing)),
            starterHash: args.existing.starterHash ?? starterWorkspaceHash,
            workspace: args.existing.toolWorkspace,
            code: args.existing.toolCode ?? deriveCodeFromWorkspace(args.existing.toolWorkspace),
            stdin:
                args.existing.toolStdin ??
                (typeof args.existing.toolWorkspace?.stdin === "string"
                    ? args.existing.toolWorkspace.stdin
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
        reviewDebug("review-runtime source-selected", {
            key: args.source.ownerKey,
            entryFound: !!args.source.entry,
            targetKind: args.source.entry?.targetKind ?? args.source.ownerKind,
            starterFilesCount: Array.isArray(args.source.entry?.starterFiles) ? args.source.entry.starterFiles.length : 0,
            starterCodeLength: typeof args.source.entry?.starterCode === "string" ? args.source.entry.starterCode.length : 0,
            hasStarter: args.source.workspaceSeedMode === "starter",
            workspaceFileCount: workspaceFileCount(args.existing.workspace),
            workspaceNonEmpty: workspaceHasUsableFile(args.existing.workspace),
            sourceType: "existing-runtime",
        });
        return {
            workspaceStatus: args.existing.workspaceStatus ?? "ready",
            workspaceSeedMode: args.existing.workspaceSeedMode ?? "restored",
            workspaceOrigin: args.existing.workspaceOrigin ?? "saved",
            userEdited: Boolean(args.existing.userEdited ?? isUserWorkspaceState(args.existing)),
            starterHash: args.existing.starterHash ?? starterWorkspaceHash,
            workspace: args.existing.workspace,
            code: args.existing.code ?? deriveCodeFromWorkspace(args.existing.workspace),
            stdin:
                args.existing.stdin ??
                (typeof args.existing.workspace?.stdin === "string" ? args.existing.workspace.stdin : ""),
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
        reviewDebug("review-runtime source-selected", {
            key: args.source.ownerKey,
            entryFound: !!args.source.entry,
            targetKind: args.source.entry?.targetKind ?? args.source.ownerKind,
            starterFilesCount: Array.isArray(args.source.entry?.starterFiles) ? args.source.entry.starterFiles.length : 0,
            starterCodeLength: typeof args.source.entry?.starterCode === "string" ? args.source.entry.starterCode.length : 0,
            hasStarter: args.source.workspaceSeedMode === "starter",
            workspaceFileCount: workspaceFileCount(legacyWorkspace),
            workspaceNonEmpty: workspaceHasUsableFile(legacyWorkspace),
            sourceType: "legacy-runtime",
        });
        return {
            workspaceStatus: "ready" as const,
            workspaceSeedMode: "restored" as const,
            workspaceOrigin: legacyState?.workspaceOrigin ?? "saved",
            userEdited: Boolean(legacyState?.userEdited ?? isUserWorkspaceState(legacyState)),
            starterHash: legacyState?.starterHash ?? starterWorkspaceHash,
            workspace: legacyWorkspace,
            code:
                (args.source.ownerKind === "exercise"
                    ? args.existingExercise?.code
                    : args.existingCard?.toolCode) ??
                deriveCodeFromWorkspace(legacyWorkspace),
            stdin:
                (args.source.ownerKind === "exercise"
                    ? args.existingExercise?.stdin
                    : args.existingCard?.toolStdin) ??
                (typeof legacyWorkspace.stdin === "string" ? legacyWorkspace.stdin : ""),
            language:
                resolveCourseLanguage({
                    language:
                        (args.source.ownerKind === "exercise"
                            ? args.existingExercise?.language ?? args.existingExercise?.lang
                            : args.existingCard?.toolLang) ?? resolvedLanguage,
                    target: manifest ?? args.source.entry?.item ?? null,
                }),
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
        const {
            exerciseKey,
            subjectSlug,
            moduleSlug,
            sectionSlug,
            topicId,
            cardId,
            manifest,
            saved,
        } = args;

        set((state) => {
            const existing = state.exercises[exerciseKey];
            const entry =
                state.targetRegistry?.byKey?.[`exercise:${exerciseKey}`] ??
                findTargetRegistryEntry(state.targetRegistry, exerciseKey, {
                    topicId,
                    sectionSlug,
                    cardId,
                    targetKind: "exercise",
                });
            const effectiveManifest = asManifestRecord(manifest ?? entry?.item);
            const savedRecord = asSavedExerciseRecord(saved);

            const existingWorkspaceLooksEmpty = !workspaceHasUsableFile(existing?.workspace);

            const registryHasStarter = targetHasStarter(effectiveManifest, entry);

            reviewDebug("starter-files ensureExercise.seed-source", {
                exerciseKey,
                entryFound: !!entry,
                entryTargetKey: entry?.targetKey,
                entryTargetSlug: entry?.targetSlug,
                entryKind: entry?.targetKind,
                entryStarterFilesCount: Array.isArray(entry?.starterFiles) ? entry.starterFiles.length : null,
                entryStarterCodeLength: typeof entry?.starterCode === "string" ? entry.starterCode.length : null,
                manifestId: effectiveManifest?.id,
                registryHasStarter,
                existingWorkspaceLooksEmpty,
            });

            const language = resolveCourseLanguage({
                subjectSlug,
                language:
                    effectiveManifest?.language ??
                    effectiveManifest?.lang ??
                    savedRecord?.language ??
                    savedRecord?.lang ??
                    entry?.language,
                runtimeDefaults: entry?.runtimeDefaults ?? entry?.topicRuntimeDefaults ?? entry?.moduleRuntimeDefaults ?? null,
                target: effectiveManifest ?? entry?.item ?? null,
            });

            const rawSavedWorkspace =
                savedRecord && isWorkspace(savedRecord.workspace)
                    ? savedRecord.workspace
                    : savedRecord && isWorkspace(savedRecord.codeWorkspace)
                        ? savedRecord.codeWorkspace
                        : savedRecord && isWorkspace(savedRecord.ideWorkspace)
                            ? savedRecord.ideWorkspace
                            : null;

            const starterWorkspace = resolveExerciseWorkspace({
                language,
                manifest: effectiveManifest,
                entry,
            });

            const trustedExistingWorkspace = shouldUseSavedUserWorkspace({
                savedState: existing,
                savedWorkspace: existing?.workspace,
                starterWorkspace,
                language,
            });

            const existingLanguageMatchesTarget = existing
                ? languagesCompatible(
                    existing.language ?? existing.lang ?? workspaceLanguage(existing.workspace),
                    language,
                )
                : false;

            /**
             * Critical:
             * Never preserve an existing runtime state across a target/language change.
             * This prevents Python workspaces/files from leaking into SQL exercises, and
             * vice versa.
             */
            if (
                existing &&
                existingLanguageMatchesTarget &&
                trustedExistingWorkspace &&
                isUserWorkspaceState(existing)
            ) {
                return state;
            }

            if (
                existing &&
                existingLanguageMatchesTarget &&
                trustedExistingWorkspace &&
                !registryHasStarter
            ) {
                return state;
            }

            if (
                existing &&
                existingLanguageMatchesTarget &&
                trustedExistingWorkspace &&
                registryHasStarter &&
                existing.workspaceStatus === "ready"
            ) {
                return state;
            }

            const trustedSavedWorkspace = shouldUseSavedUserWorkspace({
                savedState: saved,
                savedWorkspace: rawSavedWorkspace,
                starterWorkspace,
                language,
            });
            const savedWorkspace =
                trustedSavedWorkspace && workspaceHasUsableFile(rawSavedWorkspace)
                    ? rawSavedWorkspace
                    : null;

            const workspace = resolveExerciseWorkspace({
                language,
                manifest: effectiveManifest,
                saved: savedWorkspace,
                entry,
            });
            const workspaceNonEmpty = workspaceHasUsableFile(workspace);

            reviewDebug("review-runtime source-selected", {
                key: exerciseKey,
                entryFound: !!entry,
                targetKind: entry?.targetKind ?? "exercise",
                starterFilesCount: Array.isArray(entry?.starterFiles) ? entry.starterFiles.length : 0,
                starterCodeLength: typeof entry?.starterCode === "string" ? entry.starterCode.length : 0,
                hasStarter: registryHasStarter,
                workspaceFileCount: workspaceFileCount(workspace),
                workspaceNonEmpty,
                sourceType: savedWorkspace ? "saved-or-restored" : registryHasStarter ? "starter" : "empty",
            });

            if (registryHasStarter && !workspaceNonEmpty) {
                console.error("[review-runtime] starter-backed target resolved blank workspace", {
                    key: exerciseKey,
                    entryTargetKey: entry?.targetKey,
                    entryTargetSlug: entry?.targetSlug,
                    starterFiles: entry?.starterFiles,
                    starterCodeLength: typeof entry?.starterCode === "string" ? entry.starterCode.length : 0,
                    itemWorkspace: entry?.item?.workspace ?? effectiveManifest?.workspace ?? null,
                });
            }

            const sqlRuntime = resolveCourseSqlRunnerConfig({
                subjectSlug,
                language,
                target: effectiveManifest ?? entry?.item ?? null,
                topicRuntimeDefaults: entry?.topicRuntimeDefaults ?? null,
                moduleRuntimeDefaults: entry?.moduleRuntimeDefaults ?? null,
                runtimeDefaults: entry?.runtimeDefaults ?? null,
            });

            if (sqlRuntime.isSql && !sqlRuntime.sqlDatasetId) {
                console.warn("[review-runtime] SQL exercise has no resolved dataset", {
                    exerciseKey,
                    manifestId: effectiveManifest?.id,
                    source: sqlRuntime.datasetResolution.source,
                    error: sqlRuntime.datasetResolution.error,
                });
            }

            const stdin =
                (() => {
                    const manifestWorkspace = asRecord(effectiveManifest?.workspace);
                    return (
                trustedSavedWorkspace && typeof savedRecord?.stdin === "string"
                    ? savedRecord.stdin
                    : trustedSavedWorkspace && typeof savedRecord?.codeStdin === "string"
                        ? savedRecord.codeStdin
                        : typeof workspace.stdin === "string"
                            ? workspace.stdin
                            : typeof manifestWorkspace?.initialStdin === "string"
                                ? manifestWorkspace.initialStdin
                                : typeof effectiveManifest?.initialStdin === "string"
                                    ? effectiveManifest.initialStdin
                                    : typeof effectiveManifest?.stdin === "string"
                                        ? effectiveManifest.stdin
                                        : ""
                    );
                })();

            const recipeRecord = asManifestRecord(effectiveManifest?.recipe);

            const normalized = normalizeWorkspacePatch({workspace, stdin});
            const starterHash = workspaceHash(starterWorkspace);
            const savedUserEdited = Boolean(
                savedRecord?.userEdited === true ||
                savedRecord?.workspaceOrigin === "user" ||
                savedRecord?.workspaceOrigin === "saved",
            );
            const workspaceOrigin: WorkspaceOrigin =
                savedWorkspace
                    ? "saved"
                    : registryHasStarter
                        ? "starter"
                        : "empty";

            exerciseDebug("G_reviewRuntimeStore_ensureExercise_create", {
                exerciseKey,
                subjectSlug,
                moduleSlug,
                sectionSlug,
                topicId,
                cardId,
                manifestId: effectiveManifest?.id,
                savedPatch: summarizeExercisePatch(savedRecord),
                resolvedWorkspace: summarizeExerciseWorkspace(workspace),
                stdin,
            });

            const exercise: ExerciseRuntimeState = {
                exerciseKey,
                subjectSlug,
                moduleSlug,
                sectionSlug,
                topicId,
                cardId,
                exerciseId:
                    typeof savedRecord?.exerciseId === "string"
                        ? savedRecord.exerciseId
                        : typeof savedRecord?.stableExerciseId === "string"
                            ? savedRecord.stableExerciseId
                            : getFinalExerciseIdFromKey(exerciseKey),
                language,
                workspace: normalized.workspace,
                stdin,
                runner: savedRecord?.runner ?? {},
                answer: savedRecord?.answer ?? {
                    revealed: false,
                    solutionCode:
                        (typeof recipeRecord?.solutionCode === "string"
                            ? recipeRecord.solutionCode
                            : typeof effectiveManifest?.solutionCode === "string"
                                ? effectiveManifest.solutionCode
                                : undefined),
                    solutionFiles:
                        asStringRecord(recipeRecord?.solutionFiles) ??
                        asStringRecord(effectiveManifest?.solutionFiles) ??
                        undefined,
                },
                sketch: resolveSketchState({
                    savedSketch: isSavedSketchState(savedRecord?.sketch) ? savedRecord.sketch : null,
                    starterSketch: isSavedSketchState(effectiveManifest?.starterSketch) ? effectiveManifest.starterSketch : null,
                }),
                status: savedRecord?.status ?? "not_started",
                workspaceStatus: registryHasStarter && !workspaceNonEmpty ? "error" : "ready",
                workspaceOrigin,
                userEdited: savedUserEdited,
                starterHash,
                updatedAt:
                    typeof savedRecord?.updatedAt === "number" ? savedRecord.updatedAt : Date.now(),

                code:
                    trustedSavedWorkspace &&
                    workspaceHasUsableFile(rawSavedWorkspace) &&
                    typeof savedRecord?.code === "string"
                        ? savedRecord.code
                        : normalized.code,
                lang: trustedSavedWorkspace && typeof savedRecord?.lang === "string" ? savedRecord.lang : language,
                codeWorkspace: normalized.workspace,
                ideWorkspace: normalized.workspace,
                codeStdin: stdin,
                ...(sqlRuntime.isSql
                    ? {
                        fixedSqlDialect: sqlRuntime.sqlDialect,
                        sqlDialect: sqlRuntime.sqlDialect,
                        sqlDatasetId: sqlRuntime.sqlDatasetId,
                        sqlDatasetResolutionSource: sqlRuntime.datasetResolution.source,
                        sqlDatasetResolutionError: sqlRuntime.datasetResolution.error,
                        sqlSchemaSql: sqlRuntime.sqlSchemaSql,
                        sqlSeedSql: sqlRuntime.sqlSeedSql,
                        sqlInitialTableSnapshots: sqlRuntime.sqlInitialTableSnapshots,
                        runtime: {
                            kind: "sql",
                            datasetId: sqlRuntime.sqlDatasetId,
                            resultShape: "table",
                        },
                    }
                    : {}),
            };

            const existingWorkspaceKey = workspaceContentKey(existing?.workspace ?? null);
            const nextWorkspaceKey = workspaceContentKey(exercise.workspace ?? null);
            const existingCode = String(existing?.code ?? deriveCodeFromWorkspace(existing?.workspace ?? null) ?? "");
            const nextCode = String(exercise.code ?? "");
            const existingStdin = String(existing?.stdin ?? existing?.codeStdin ?? "");
            const nextStdin = String(exercise.stdin ?? exercise.codeStdin ?? "");
            const existingLanguage = String(existing?.language ?? existing?.lang ?? "");
            const nextLanguage = String(exercise.language ?? exercise.lang ?? "");
            const existingStatus = String(existing?.status ?? "");
            const nextStatus = String(exercise.status ?? "");
            const existingWorkspaceStatus = String((existing as any)?.workspaceStatus ?? "");
            const nextWorkspaceStatus = String((exercise as any)?.workspaceStatus ?? "");
            const existingExerciseId = String(existing?.exerciseId ?? "");
            const nextExerciseId = String(exercise.exerciseId ?? "");
            const existingWorkspaceOrigin = String(existing?.workspaceOrigin ?? "");
            const nextWorkspaceOrigin = String(exercise.workspaceOrigin ?? "");
            const existingStarterHash = String(existing?.starterHash ?? "");
            const nextStarterHash = String(exercise.starterHash ?? "");
            const existingUserEdited = Boolean(existing?.userEdited);
            const nextUserEdited = Boolean(exercise.userEdited);

            const noMeaningfulChange = Boolean(
                existing &&
                existingWorkspaceKey === nextWorkspaceKey &&
                existingCode === nextCode &&
                existingStdin === nextStdin &&
                existingLanguage === nextLanguage &&
                existingStatus === nextStatus &&
                existingWorkspaceStatus === nextWorkspaceStatus &&
                existingExerciseId === nextExerciseId &&
                existingWorkspaceOrigin === nextWorkspaceOrigin &&
                existingStarterHash === nextStarterHash &&
                existingUserEdited === nextUserEdited,
            );

            starterLoopTrace("runtime.ensureExercise.compare", {
                key: exerciseKey,
                existingWorkspaceKey,
                nextWorkspaceKey,
                existingCodeLength: existingCode.length,
                nextCodeLength: nextCode.length,
                existingStdinLength: existingStdin.length,
                nextStdinLength: nextStdin.length,
                existingLanguage,
                nextLanguage,
                existingStatus,
                nextStatus,
                existingWorkspaceStatus,
                nextWorkspaceStatus,
                existingExerciseId,
                nextExerciseId,
                noop: noMeaningfulChange,
                registryHasStarter,
            });

            if (noMeaningfulChange) {
                return state;
            }

            const nextState: Partial<ReviewRuntimeState> = {
                exercises: {
                    ...state.exercises,
                    [exerciseKey]: exercise,
                },
            };

            if (state.activeExerciseKey === exerciseKey) {
                nextState.boundToolWorkspace = normalized.workspace;
            }

            return nextState;
        });
    },

    patchExercise: (key, patch) => {
        let didPatch = false;

        set((state) => {
            const existing = state.exercises[key];
            const patchHasWorkspace =
                isWorkspace(patch.workspace) ||
                isWorkspace(patch.codeWorkspace) ||
                isWorkspace(patch.ideWorkspace);
            const rawIncomingWorkspace = getPatchWorkspace(patch, existing);
            const incomingWorkspace =
                !patchHasWorkspace &&
                typeof patch.code === "string" &&
                (patch.userEdited === true || patch.workspaceOrigin === "user")
                    ? workspaceWithEntryCode(rawIncomingWorkspace, patch.code)
                    : rawIncomingWorkspace;

            if (!existing && !incomingWorkspace) return state;

            const stdin =
                typeof patch.stdin === "string"
                    ? patch.stdin
                    : typeof patch.codeStdin === "string"
                        ? patch.codeStdin
                        : typeof incomingWorkspace?.stdin === "string"
                            ? incomingWorkspace.stdin
                            : existing?.stdin ?? "";

            const normalized = incomingWorkspace
                ? normalizeWorkspacePatch({workspace: incomingWorkspace, stdin})
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
                patchExerciseId: (patch as any).exerciseId,
                patchKeys: Object.keys(patch ?? {}),
                patch: summarizeExercisePatch(patch),
                existing: summarizeExercisePatch(existing),
                nextCode: code,
                nextWorkspace: summarizeExerciseWorkspace(workspace),
            });

            reviewDebug("2_RUNTIME_PATCH reviewRuntimeStore.patchExercise", {
                key,
                patchKeys: Object.keys(patch ?? {}),
                patchCode: typeof patch.code === "string" ? patch.code : "",
                derivedCode: code,
                existingCode: existing?.code ?? "",
                workspace: summarizeWorkspace(workspace),
                existingExerciseId: existing?.exerciseId,
                patchExerciseId: (patch as any).exerciseId,
            });

            reviewSaveDebug("runtime patchExercise", {
                exerciseKey: key,
                patchKeys: Object.keys(patch ?? {}),
                patchUserEdited: (patch as any).userEdited,
                patchWorkspaceOrigin: (patch as any).workspaceOrigin,
                existingUserEdited: existing?.userEdited,
                existingWorkspaceOrigin: existing?.workspaceOrigin,
                nextCodeLength: String(code ?? "").length,
                stdinLength: String(stdin ?? "").length,
                workspace: summarizeWorkspaceForSave(workspace),
            });

            const nextLanguage =
                typeof patch.language === "string"
                    ? patch.language
                    : typeof patch.lang === "string"
                        ? patch.lang
                        : existing?.language ?? workspace.language ?? "python";

            const nextLang =
                typeof patch.lang === "string"
                    ? patch.lang
                    : typeof patch.language === "string"
                        ? patch.language
                        : existing?.lang ?? nextLanguage;
            const nextWorkspaceOrigin: WorkspaceOrigin =
                patch.userEdited === true || patch.workspaceOrigin === "user"
                    ? "user"
                    : typeof patch.workspaceOrigin === "string"
                        ? patch.workspaceOrigin as WorkspaceOrigin
                        : existing?.workspaceOrigin ?? "restored";
            const nextUserEdited =
                patch.userEdited === true ||
                patch.workspaceOrigin === "user" ||
                patch.workspaceOrigin === "saved" ||
                existing?.userEdited === true;
            const nextStarterHash =
                typeof patch.starterHash === "string"
                    ? patch.starterHash
                    : existing?.starterHash;

            const existingWorkspaceKey = workspaceContentKey(existing?.workspace ?? null);
            const nextWorkspaceKey = workspaceContentKey(workspace ?? null);
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
                existingCodeLength: existingCode.length,
                nextCodeLength: nextCode.length,
                existingStdinLength: existingStdin.length,
                nextStdinLength: nextStdin.length,
                existingLanguage,
                nextLanguage: nextLanguageComparable,
                noop: noMeaningfulChange,
                patchKeys: Object.keys(patch ?? {}),
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
                    typeof patch.exerciseId === "string"
                        ? patch.exerciseId
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
                ...patch,
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
                    codeWorkspace: workspace ?? undefined,
                    ideWorkspace: workspace ?? undefined,
                    codeStdin: nextStdin,
                } as ExerciseRuntimeState;

                nextState.exercises = {
                    ...state.exercises,
                    [ownerKey]: {
                        ...baseExercise,
                        workspace: workspace ?? baseExercise.workspace,
                        stdin: nextStdin,
                        code: nextCode,
                        language: existing.language,
                        lang: existing.language,
                        codeWorkspace: workspace ?? baseExercise.workspace,
                        ideWorkspace: workspace ?? baseExercise.workspace,
                        codeStdin: nextStdin,
                        workspaceStatus: workspace ? "ready" : baseExercise.workspaceStatus,
                        workspaceOrigin: workspace ? "user" : baseExercise.workspaceOrigin,
                        userEdited: workspace ? true : baseExercise.userEdited,
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
                    toolWorkspace: workspace,
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
                        toolWorkspace: workspace,
                        toolCode: nextCode,
                        toolStdin: nextStdin,
                        toolLang: existing.language,
                        workspaceStatus: workspace ? "ready" : baseCard.workspaceStatus,
                        workspaceSeedMode: workspace ? "restored" : baseCard.workspaceSeedMode,
                        workspaceOrigin: workspace ? "user" : baseCard.workspaceOrigin,
                        userEdited: workspace ? true : baseCard.userEdited,
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
    syncActiveTarget: (target) => {
        if (!target) return;

        const {targetRegistry, subjectSlug, moduleSlug} = get();
        if (!targetRegistry) return;
        const routeKey = `${target.sectionSlug}/${target.topicSlug}/${target.targetKind}/${target.targetSlug}`;
        const targetKey = targetRegistry?.byRoute?.[routeKey] ?? null;
        const registryEntry = targetKey ? targetRegistry?.byKey?.[targetKey] ?? null : null;
        if (!registryEntry) return;
        const editorSource = resolveDeterministicEditorSource(registryEntry);

        if (editorSource) {
            get().ensureEditorSource(editorSource);
        }

        if (target.kind === "exercise") {
            const baseManifest = asManifestRecord(registryEntry?.toolManifest ?? registryEntry?.item ?? null);
            const baseWorkspace = asRecord(baseManifest?.workspace);
            const baseRecipe = asRecord(baseManifest?.recipe);
            const routeExerciseManifest = baseManifest
                ? {
                    ...baseManifest,
                    starterCode:
                        registryEntry?.starterCode ??
                        baseManifest?.starterCode ??
                        (typeof baseWorkspace?.starterCode === "string" ? baseWorkspace.starterCode : undefined) ??
                        (typeof baseRecipe?.starterCode === "string" ? baseRecipe.starterCode : undefined),
                    starterFiles:
                        registryEntry?.starterFiles ??
                        baseManifest?.starterFiles ??
                        baseWorkspace?.starterFiles ??
                        baseRecipe?.starterFiles,
                    workspace:
                        registryEntry?.starterWorkspace ??
                        baseManifest.workspace ??
                        null,
                }
                : baseManifest;
            get().ensureExercise({
                exerciseKey: target.exerciseStateKey,
                subjectSlug: subjectSlug ?? "",
                moduleSlug: moduleSlug ?? "",
                sectionSlug: target.sectionSlug,
                topicId: target.topicId,
                cardId: target.cardId,
                manifest: routeExerciseManifest,
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
