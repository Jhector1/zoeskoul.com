import type { CodeLanguage } from "@/lib/practice/types";
import type { WorkspaceStateV2 } from "../types";
import type { DraftStorageMode, WorkspaceMeta } from "./workspace.types";
import { loadV2, saveV2, storageKeyForLanguage, tryMigrateV1, STORAGE_KEY_V2 } from "../storage";

export function isCodeLanguage(v: unknown): v is CodeLanguage {
  return (
    v === "python" ||
    v === "java" ||
    v === "javascript" ||
    v === "c" ||
    v === "cpp" ||
    v === "sql"
  );
}

export function metaKeyFor(baseKey: string) {
  return `${baseKey}:meta`;
}

export function readWorkspaceMeta(baseKey: string): WorkspaceMeta | null {
  try {
    const raw = localStorage.getItem(metaKeyFor(baseKey));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<WorkspaceMeta>;
    if (!parsed || !isCodeLanguage(parsed.lastLanguage)) return null;

    return { lastLanguage: parsed.lastLanguage };
  } catch {
    return null;
  }
}

export function saveWorkspaceMeta(baseKey: string, meta: WorkspaceMeta) {
  try {
    localStorage.setItem(metaKeyFor(baseKey), JSON.stringify(meta));
  } catch {}
}

export function loadWorkspaceForLanguage(args: {
  baseStorageKey: string;
  next: CodeLanguage;
  draftStorageMode: DraftStorageMode;
}) {
  if (args.draftStorageMode !== "local") return null;
  const key = storageKeyForLanguage(args.baseStorageKey, args.next);
  return loadV2(key as never, args.next as never);
}

export function saveWorkspaceForLanguage(args: {
  baseStorageKey: string;
  ws: WorkspaceStateV2 | null;
  draftStorageMode: DraftStorageMode;
}) {
  const { baseStorageKey, ws, draftStorageMode } = args;
  if (!ws) return;
  if (draftStorageMode !== "local") return;

  const key = storageKeyForLanguage(baseStorageKey, ws.language);
  saveV2(key, ws);
  saveWorkspaceMeta(baseStorageKey, { lastLanguage: ws.language });
}

export function tryMigrateInitialWorkspace(args: {
  baseStorageKey: string;
  initialLanguage: CodeLanguage;
  forcedLanguage?: CodeLanguage;
  draftStorageMode: DraftStorageMode;
  saveWorkspaceForLanguage: (ws: WorkspaceStateV2 | null) => void;
}) {
  const { baseStorageKey, initialLanguage, forcedLanguage, draftStorageMode, saveWorkspaceForLanguage } = args;
  if (draftStorageMode !== "local") return null;
  if (baseStorageKey !== STORAGE_KEY_V2) return null;

  const migrated = tryMigrateV1(initialLanguage);
  if (!migrated) return null;

  saveWorkspaceForLanguage(migrated);
  if (forcedLanguage && migrated.language !== forcedLanguage) {
    return null;
  }

  return migrated;
}

export { STORAGE_KEY_V2 };
