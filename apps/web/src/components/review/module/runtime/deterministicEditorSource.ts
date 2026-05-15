import type { WorkspaceStateV2 } from "@/components/ide/types";
import type { ReviewTargetEntry } from "./reviewTargetRegistry";
import type { UnknownRecord } from "./reviewRuntimeTypes";
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
  const recipe = asRecord(source.recipe);

  const workspaceCandidate =
      entry.starterWorkspace ??
      source.initialWorkspace ??
      source.starterWorkspace ??
      manifestRecord?.initialWorkspace ??
      manifestRecord?.starterWorkspace ??
      null;

  return Boolean(
      hasUsableStarterFilesValue(entry.starterFiles) ||
      isUsableStarterCode(entry.starterCode) ||
      hasUsableStarterFilesValue(workspaceContainer.starterFiles) ||
      hasUsableStarterFilesValue(workspaceContainer.initialFiles) ||
      hasUsableStarterFilesValue(workspaceContainer.workspaceFiles) ||
      hasUsableStarterFilesValue(source.starterFiles) ||
      hasUsableStarterFilesValue(source.initialFiles) ||
      hasUsableStarterFilesValue(source.workspaceFiles) ||
      isUsableStarterCode(workspaceContainer.starterCode) ||
      isUsableStarterCode(source.starterCode) ||
      hasUsableStarterFilesValue(recipe?.starterFiles) ||
      hasUsableStarterFilesValue(recipe?.initialFiles) ||
      isUsableStarterCode(recipe?.starterCode) ||
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