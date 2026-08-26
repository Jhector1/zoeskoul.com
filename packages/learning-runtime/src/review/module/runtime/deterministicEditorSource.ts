import type { WorkspaceStateV2 } from "@zoeskoul/workspace-contracts";
import type { ReviewTargetEntry } from "./reviewTargetRegistry";
import type { UnknownRecord } from "@zoeskoul/learning-runtime";
import {
  hasUsableStarterFilesValue,
  isUsableStarterCode,
  workspaceHasUsableStarterContent,
} from "./starterContent";

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
  const workspaceContainer =
      asRecord(source.workspace) ?? asRecord(manifestRecord?.workspace) ?? {};

  const workspaceCandidate =
      entry.starterWorkspace ??
      source.initialWorkspace ??
      source.starterWorkspace ??
      manifestRecord?.initialWorkspace ??
      manifestRecord?.starterWorkspace ??
      null;

  /**
   * Published curriculum starter content is workspace-owned. Do not re-read
   * entry/source/recipe starterCode or starterFiles aliases here.
   *
   * Preserve unresolved @: aliases in canonical workspace fields so
   * localization can still resolve them later, but do not treat alias-only
   * values as concrete starter content.
   */
  return Boolean(
      hasUsableStarterFilesValue(workspaceContainer.starterFiles) ||
      hasUsableStarterFilesValue(workspaceContainer.initialFiles) ||
      hasUsableStarterFilesValue(workspaceContainer.workspaceFiles) ||
      (
          !!workspaceCandidate &&
          typeof workspaceCandidate === "object" &&
          (workspaceCandidate as WorkspaceStateV2).version === 2 &&
          Array.isArray((workspaceCandidate as WorkspaceStateV2).nodes) &&
          workspaceHasUsableStarterContent(workspaceCandidate as WorkspaceStateV2)
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
