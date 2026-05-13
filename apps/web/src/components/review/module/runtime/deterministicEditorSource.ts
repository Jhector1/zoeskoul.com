import type { WorkspaceStateV2 } from "@/components/ide/types";
import type { ReviewTargetEntry } from "./reviewTargetRegistry";
import type { UnknownRecord } from "./reviewRuntimeTypes";

export type ReviewDeterministicEditorSource = {
  ownerKey: string;
  ownerKind: "card" | "exercise";
  targetKey: string;
  toolScopeKey: string;
  language: string;
  manifest: unknown;
  entry: ReviewTargetEntry;
  workspaceSeedMode: "starter" | "empty";
};

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null
    ? (value as UnknownRecord)
    : null;
}

function manifestHasStarter(manifest: unknown, entry: ReviewTargetEntry) {
  const item = entry.item ?? manifest;
  const itemRecord = asRecord(item);
  const source = asRecord(itemRecord?.spec) ?? itemRecord ?? {};
  const manifestRecord = asRecord(manifest);
  const workspaceContainer = asRecord(source.workspace) ?? asRecord(manifestRecord?.workspace) ?? {};
  const hasFiles = (value: unknown) => {
    if (Array.isArray(value)) return value.length > 0;

    if (!!value && typeof value === "object") {
      return Object.entries(value as Record<string, unknown>).some(([key, entry]) => {
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
        return !!entry && typeof entry === "object";
      });
    }

    return false;
  };
  const workspaceCandidate =
    entry.starterWorkspace ??
    source.initialWorkspace ??
    source.starterWorkspace ??
    manifestRecord?.initialWorkspace ??
    manifestRecord?.starterWorkspace ??
    null;

  return Boolean(
      hasFiles(entry.starterFiles) ||
      (typeof entry.starterCode === "string" && entry.starterCode.trim().length > 0) ||
      hasFiles(workspaceContainer.starterFiles) ||
      hasFiles(workspaceContainer.initialFiles) ||
      hasFiles(workspaceContainer.workspaceFiles) ||
      hasFiles(source.starterFiles) ||
      hasFiles(source.initialFiles) ||
      hasFiles(source.workspaceFiles) ||
      (typeof workspaceContainer.starterCode === "string" && workspaceContainer.starterCode.trim().length > 0) ||
      (typeof source.starterCode === "string" && source.starterCode.trim().length > 0) ||
      hasFiles(asRecord(source.recipe)?.starterFiles) ||
      hasFiles(asRecord(source.recipe)?.initialFiles) ||
      (typeof asRecord(source.recipe)?.starterCode === "string" && String(asRecord(source.recipe)?.starterCode).trim().length > 0) ||
      (
        !!workspaceCandidate &&
        typeof workspaceCandidate === "object" &&
        (workspaceCandidate as WorkspaceStateV2).version === 2 &&
        Array.isArray((workspaceCandidate as WorkspaceStateV2).nodes)
      )
  );
}

export function resolveDeterministicEditorSource(
  entry: ReviewTargetEntry | null | undefined,
): ReviewDeterministicEditorSource | null {
  if (!entry) return null;

  const manifest = entry.toolManifest ?? entry.item ?? null;
  return {
    ownerKey: entry.ownerKey,
    ownerKind: entry.ownerKind,
    targetKey: entry.targetKey,
    toolScopeKey: entry.toolScopeKey,
    language: entry.language ?? "python",
    manifest,
    entry,
    workspaceSeedMode: manifestHasStarter(manifest, entry) ? "starter" : "empty",
  };
}
