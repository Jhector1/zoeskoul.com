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
    isWorkspace ||
      hasFiles(entry.starterFiles) ||
      hasFiles((entry as any).solutionFiles) ||
      (typeof entry.starterCode === "string" && entry.starterCode.length > 0) ||
      hasFiles(workspaceContainer?.starterFiles) ||
      hasFiles(workspaceContainer?.solutionFiles) ||
      hasFiles(workspaceContainer?.files) ||
      hasFiles(workspaceContainer?.initialFiles) ||
      hasFiles(workspaceContainer?.workspaceFiles) ||
      (typeof workspaceContainer?.solutionCode === "string" && workspaceContainer.solutionCode.trim().length > 0) ||
      hasFiles(source?.starterFiles) ||
      hasFiles(source?.solutionFiles) ||
      hasFiles(source?.files) ||
      hasFiles(source?.initialFiles) ||
      hasFiles(source?.workspaceFiles) ||
      (typeof workspaceContainer?.starterCode === "string" && workspaceContainer.starterCode.trim().length > 0) ||
      (typeof workspaceContainer?.code === "string" && workspaceContainer.code.trim().length > 0) ||
      (typeof workspaceContainer?.content === "string" && workspaceContainer.content.trim().length > 0) ||
      (typeof workspaceContainer?.source === "string" && workspaceContainer.source.trim().length > 0) ||
      (typeof source?.solutionCode === "string" && source.solutionCode.trim().length > 0) ||
      (typeof source?.starterCode === "string" && source.starterCode.trim().length > 0) ||
      (typeof source?.code === "string" && source.code.trim().length > 0) ||
      (typeof source?.content === "string" && source.content.trim().length > 0) ||
      (typeof source?.source === "string" && source.source.trim().length > 0) ||
      hasFiles(source?.recipe?.solutionFiles) ||
      (typeof source?.recipe?.solutionCode === "string" && source.recipe.solutionCode.trim().length > 0) ||
      hasFiles(source?.recipe?.starterFiles) ||
      hasFiles(source?.recipe?.files) ||
      hasFiles(source?.recipe?.initialFiles) ||
      (typeof source?.recipe?.starterCode === "string" && source.recipe.starterCode.trim().length > 0) ||
      (typeof source?.recipe?.solutionTemplate === "string" && source.recipe.solutionTemplate.trim().length > 0)
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
