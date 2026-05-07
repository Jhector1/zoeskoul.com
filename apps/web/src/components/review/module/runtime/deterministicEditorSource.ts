import type { WorkspaceStateV2 } from "@/components/ide/types";
import type { ReviewTargetEntry } from "./reviewTargetRegistry";

export type ReviewDeterministicEditorSource = {
  ownerKey: string;
  ownerKind: "card" | "exercise";
  targetKey: string;
  toolScopeKey: string;
  language: string;
  manifest: any;
  entry: ReviewTargetEntry;
  workspaceSeedMode: "starter" | "empty";
};

function manifestHasStarter(manifest: any, entry: ReviewTargetEntry) {
  const item = entry?.item ?? manifest;
  const source = item?.spec ?? item ?? {};
  const workspaceContainer = source?.workspace ?? manifest?.workspace ?? {};
  const hasFiles = (value: unknown) =>
    Array.isArray(value)
      ? value.length > 0
      : !!value && typeof value === "object" && Object.keys(value as Record<string, unknown>).length > 0;
  const workspaceCandidate =
    entry.starterWorkspace ??
    workspaceContainer ??
    source?.initialWorkspace ??
    source?.starterWorkspace ??
    manifest?.initialWorkspace ??
    manifest?.starterWorkspace ??
    null;

  const isWorkspace =
    !!workspaceCandidate &&
    typeof workspaceCandidate === "object" &&
    (workspaceCandidate as WorkspaceStateV2).version === 2 &&
    Array.isArray((workspaceCandidate as WorkspaceStateV2).nodes);

  return Boolean(
      hasFiles(entry.starterFiles) ||
      (typeof entry.starterCode === "string" && entry.starterCode.length > 0) ||
      hasFiles(workspaceContainer?.starterFiles) ||
      hasFiles(workspaceContainer?.initialFiles) ||
      hasFiles(workspaceContainer?.workspaceFiles) ||
      hasFiles(source?.starterFiles) ||
      hasFiles(source?.initialFiles) ||
      hasFiles(source?.workspaceFiles) ||
      (typeof workspaceContainer?.starterCode === "string" && workspaceContainer.starterCode.trim().length > 0) ||
      (typeof source?.starterCode === "string" && source.starterCode.trim().length > 0) ||
      hasFiles(source?.recipe?.starterFiles) ||
      hasFiles(source?.recipe?.initialFiles) ||
      (typeof source?.recipe?.starterCode === "string" && source.recipe.starterCode.trim().length > 0)
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
