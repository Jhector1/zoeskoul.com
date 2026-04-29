import type { WorkspaceLanguage } from "@/lib/practice/types";
import type { WorkspaceStateV2 } from "../types";
import type { DraftStorageMode, WorkspaceMeta } from "./workspace.types";
import {
  loadV2,
  saveV2,
  storageKeyForWorkspace,
  legacyStorageKeyForWorkspace,
  tryMigrateV1,
  STORAGE_KEY_V2,
} from "../storage";

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
  localWorkspaceId?: string | null;
}) {
  if (args.draftStorageMode !== "local") return null;

  const key = storageKeyForWorkspace({
    baseKey: args.baseStorageKey,
    language: args.next,
    actorKey: args.actorKey,
    projectId: args.projectId,
    scopeKey: args.scopeKey,
    localWorkspaceId: args.localWorkspaceId,
  });

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
    void saveV2(key, legacyLoaded);
  }

  return legacyLoaded;
}

export function saveWorkspaceForLanguage(args: {
  baseStorageKey: string;
  ws: WorkspaceStateV2 | null;
  draftStorageMode: DraftStorageMode;
  actorKey?: string | null;
  projectId?: string | null;
  scopeKey?: string | null;
  localWorkspaceId?: string | null;
}) {
  const {
    baseStorageKey,
    ws,
    draftStorageMode,
    actorKey,
    projectId,
    scopeKey,
    localWorkspaceId,
  } = args;

  if (!ws) return;
  if (draftStorageMode !== "local") return;

  const key = storageKeyForWorkspace({
    baseKey: baseStorageKey,
    language: ws.language,
    actorKey,
    projectId,
    scopeKey,
    localWorkspaceId,
  });

  saveWorkspaceMeta(baseStorageKey, {
    lastLanguage: ws.language,
    actorKey: actorKey?.trim() || "anonymous",
    projectId: projectId ?? null,
    scopeKey: scopeKey ?? null,
    localWorkspaceId: localWorkspaceId ?? null,
  });

  void saveV2(key, ws);
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