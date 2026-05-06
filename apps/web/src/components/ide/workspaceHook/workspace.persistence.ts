import type { WorkspaceLanguage } from "@/lib/practice/types";
import type { WorkspaceStateV2 } from "../types";
import type { DraftStorageMode, WorkspaceMeta } from "./workspace.types";
import { stableJson } from "@/lib/client/persistence/stableJson";
import {
  loadV2,
  saveV2,
  storageKeyForWorkspace,
  legacyStorageKeyForWorkspace,
  tryMigrateV1,
  STORAGE_KEY_V2,
} from "../storage";

type QueuedWorkspaceSave = {
  serialized: string;
  workspace: WorkspaceStateV2;
};

type WorkspaceSaveQueue = {
  inFlight: boolean;
  pending: QueuedWorkspaceSave | null;
  lastSavedSerialized: string | null;
  idleWaiters: Array<() => void>;
};

const saveQueues = new Map<string, WorkspaceSaveQueue>();

function cloneWorkspace(ws: WorkspaceStateV2): WorkspaceStateV2 {
  if (typeof structuredClone === "function") {
    return structuredClone(ws);
  }

  return JSON.parse(JSON.stringify(ws)) as WorkspaceStateV2;
}

function queueFor(key: string): WorkspaceSaveQueue {
  let queue = saveQueues.get(key);
  if (!queue) {
    queue = {
      inFlight: false,
      pending: null,
      lastSavedSerialized: null,
      idleWaiters: [],
    };
    saveQueues.set(key, queue);
  }
  return queue;
}

function resolveIdleWaiters(queue: WorkspaceSaveQueue) {
  if (queue.inFlight || queue.pending) return;

  const waiters = queue.idleWaiters.splice(0);
  for (const resolve of waiters) resolve();
}

function waitForIdle(queue: WorkspaceSaveQueue): Promise<void> {
  if (!queue.inFlight && !queue.pending) return Promise.resolve();

  return new Promise((resolve) => {
    queue.idleWaiters.push(resolve);
  });
}

async function drainWorkspaceSaveQueue(key: string, queue: WorkspaceSaveQueue) {
  if (queue.inFlight) return waitForIdle(queue);

  queue.inFlight = true;

  try {
    while (queue.pending) {
      const next = queue.pending;
      queue.pending = null;

      if (next.serialized === queue.lastSavedSerialized) {
        continue;
      }

      await saveV2(key, next.workspace);
      queue.lastSavedSerialized = next.serialized;
    }
  } finally {
    queue.inFlight = false;
    resolveIdleWaiters(queue);
  }
}

async function enqueueWorkspaceSave(key: string, ws: WorkspaceStateV2): Promise<void> {
  const queue = queueFor(key);
  const serialized = stableJson(ws);

  if (
      serialized === queue.lastSavedSerialized &&
      !queue.inFlight &&
      !queue.pending
  ) {
    return;
  }

  queue.pending = {
    serialized,
    workspace: cloneWorkspace(ws),
  };

  await drainWorkspaceSaveQueue(key, queue);
}

export function isWorkspaceLanguage(v: unknown): v is WorkspaceLanguage {
  return (
      v === "python" ||
      v === "java" ||
      v === "javascript" ||
      v === "web" ||
      v === "c" ||
      v === "cpp" ||
      v === "sql"
  );
}

export function metaKeyFor(baseKey: string) {
  return `${baseKey}:meta`;
}

function normalizeNullableString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export function readWorkspaceMeta(baseKey: string): WorkspaceMeta | null {
  try {
    const raw = localStorage.getItem(metaKeyFor(baseKey));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<WorkspaceMeta>;
    if (!parsed || !isWorkspaceLanguage(parsed.lastLanguage)) return null;

    return {
      lastLanguage: parsed.lastLanguage,
      actorKey:
          typeof parsed.actorKey === "string" && parsed.actorKey.trim()
              ? parsed.actorKey
              : "anonymous",
      projectId: normalizeNullableString(parsed.projectId),
      scopeKey: normalizeNullableString(parsed.scopeKey),
      exerciseStateKey: normalizeNullableString(parsed.exerciseStateKey),
      localWorkspaceId: normalizeNullableString(parsed.localWorkspaceId),
    };
  } catch {
    return null;
  }
}

export function saveWorkspaceMeta(baseKey: string, meta: WorkspaceMeta) {
  try {
    localStorage.setItem(metaKeyFor(baseKey), JSON.stringify(meta));
  } catch {}
}

export async function loadWorkspaceForLanguage(args: {
  baseStorageKey: string;
  next: WorkspaceLanguage;
  draftStorageMode: DraftStorageMode;
  actorKey?: string | null;
  projectId?: string | null;
  scopeKey?: string | null;
  exerciseStateKey?: string | null;
  localWorkspaceId?: string | null;
}) {
  if (args.draftStorageMode !== "local") return null;

  const key = storageKeyForWorkspace({
    baseKey: args.baseStorageKey,
    language: args.next,
    actorKey: args.actorKey,
    projectId: args.projectId,
    scopeKey: args.scopeKey,
    exerciseStateKey: args.exerciseStateKey,
    localWorkspaceId: args.localWorkspaceId,
  });

  await waitForIdle(queueFor(key));

  const loaded = await loadV2(key, args.next);
  if (loaded) return loaded;

  const legacyKey = legacyStorageKeyForWorkspace({
    baseKey: args.baseStorageKey,
    language: args.next,
    actorKey: args.actorKey,
    projectId: args.projectId,
    scopeKey: args.scopeKey,
    localWorkspaceId: args.localWorkspaceId,
  });

  if (legacyKey === key) return null;

  const legacyLoaded = await loadV2(legacyKey, args.next);
  if (legacyLoaded) {
    void enqueueWorkspaceSave(key, legacyLoaded);
  }

  return legacyLoaded;
}

function storageKeyForSaveArgs(args: {
  baseStorageKey: string;
  ws: WorkspaceStateV2 | null;
  actorKey?: string | null;
  projectId?: string | null;
  scopeKey?: string | null;
  exerciseStateKey?: string | null;
  localWorkspaceId?: string | null;
}) {
  if (!args.ws) return null;

  return storageKeyForWorkspace({
    baseKey: args.baseStorageKey,
    language: args.ws.language,
    actorKey: args.actorKey,
    projectId: args.projectId,
    scopeKey: args.scopeKey,
    exerciseStateKey: args.exerciseStateKey,
    localWorkspaceId: args.localWorkspaceId,
  });
}

export async function saveWorkspaceForLanguage(args: {
  baseStorageKey: string;
  ws: WorkspaceStateV2 | null;
  draftStorageMode: DraftStorageMode;
  actorKey?: string | null;
  projectId?: string | null;
  scopeKey?: string | null;
  exerciseStateKey?: string | null;
  localWorkspaceId?: string | null;
}) {
  const {
    baseStorageKey,
    ws,
    draftStorageMode,
    actorKey,
    projectId,
    scopeKey,
    exerciseStateKey,
    localWorkspaceId,
  } = args;

  if (!ws) return;
  if (draftStorageMode !== "local") return;

  const key = storageKeyForSaveArgs({
    baseStorageKey,
    ws,
    actorKey,
    projectId,
    scopeKey,
    exerciseStateKey,
    localWorkspaceId,
  });

  if (!key) return;

  saveWorkspaceMeta(baseStorageKey, {
    lastLanguage: ws.language,
    actorKey: actorKey?.trim() || "anonymous",
    projectId: projectId ?? null,
    scopeKey: scopeKey ?? null,
    exerciseStateKey: exerciseStateKey ?? null,
    localWorkspaceId: localWorkspaceId ?? null,
  });

  await enqueueWorkspaceSave(key, ws);
}

export async function flushWorkspaceForLanguage(args: {
  baseStorageKey: string;
  ws: WorkspaceStateV2 | null;
  draftStorageMode: DraftStorageMode;
  actorKey?: string | null;
  projectId?: string | null;
  scopeKey?: string | null;
  exerciseStateKey?: string | null;
  localWorkspaceId?: string | null;
}) {
  if (args.draftStorageMode !== "local") return;
  if (!args.ws) return;

  await saveWorkspaceForLanguage(args);

  const key = storageKeyForSaveArgs(args);
  if (!key) return;

  await waitForIdle(queueFor(key));
}

export function tryMigrateInitialWorkspace(args: {
  baseStorageKey: string;
  initialLanguage: WorkspaceLanguage;
  forcedLanguage?: WorkspaceLanguage;
  draftStorageMode: DraftStorageMode;
  saveWorkspaceForLanguage: (ws: WorkspaceStateV2 | null) => void;
}) {
  const {
    baseStorageKey,
    initialLanguage,
    forcedLanguage,
    draftStorageMode,
    saveWorkspaceForLanguage,
  } = args;

  if (draftStorageMode !== "local") return null;
  if (!baseStorageKey.startsWith(STORAGE_KEY_V2)) return null;

  const migrated = tryMigrateV1(initialLanguage);
  if (!migrated) return null;

  saveWorkspaceForLanguage(migrated);

  if (forcedLanguage && migrated.language !== forcedLanguage) {
    return null;
  }

  return migrated;
}

export { STORAGE_KEY_V2 };
