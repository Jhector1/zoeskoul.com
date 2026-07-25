export type ReviewWorkspaceRuntimeCommitMode =
  | "deferred"
  | "runtime-debounced";

/**
 * Review/tutoring workspaces are never restored from browser-local drafts.
 * Their source of truth remains the review runtime and ReviewProgress document.
 */
export const REVIEW_WORKSPACE_DRAFT_STORAGE_MODE = "off" as const;

/**
 * Keep Monaco local-first while typing, then commit every editable review
 * workspace to the review runtime after a short idle period. This covers both
 * public-course review and tutoring while remaining independent from
 * browser-local draft storage.
 */
export const REVIEW_WORKSPACE_RUNTIME_COMMIT_DELAY_MS = 700;

export function resolveReviewWorkspacePersistencePolicy(args: {
  isTutoringSession: boolean;
  canEdit: boolean;
}): {
  draftStorageMode: typeof REVIEW_WORKSPACE_DRAFT_STORAGE_MODE;
  runtimeCommitMode: ReviewWorkspaceRuntimeCommitMode;
} {
  return {
    draftStorageMode: REVIEW_WORKSPACE_DRAFT_STORAGE_MODE,
    runtimeCommitMode: args.canEdit ? "runtime-debounced" : "deferred",
  };
}

export function shouldCommitReviewWorkspaceToRuntimeAfterIdle(args: {
  mode: ReviewWorkspaceRuntimeCommitMode;
  isReviewRouteMode: boolean;
  isDirectUserWorkspaceEdit: boolean;
  structureChanged: boolean;
  hasWorkspaceContent: boolean;
}) {
  return (
    args.mode === "runtime-debounced" &&
    args.isReviewRouteMode &&
    args.isDirectUserWorkspaceEdit &&
    !args.structureChanged &&
    args.hasWorkspaceContent
  );
}
