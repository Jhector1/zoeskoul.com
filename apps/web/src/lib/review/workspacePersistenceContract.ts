/**
 * Shared timing and ordering rules for every ReviewProgress-backed workspace.
 *
 * CodeToolPane owns the Monaco -> runtime hop. useReviewProgress owns the
 * runtime/progress -> database hop. A text edit is debounced exactly once;
 * structural runtime mutations are coalesced within the current task and then
 * saved immediately.
 */
export const WORKSPACE_TEXT_SAVE_DEBOUNCE_MS = 600;
export const WORKSPACE_PROGRESS_SAVE_DEBOUNCE_MS = 600;
export const WORKSPACE_RUNTIME_SAVE_COALESCE_MS = 0;

export function buildCanonicalWorkspaceIdentity(args: {
  endpoint: string;
  subjectSlug: string;
  moduleSlug: string;
  locale: string;
  ownerKey?: string | null;
  workspaceView?: string | null;
  learnerId?: string | null;
  assignmentId?: string | null;
  submissionId?: string | null;
}) {
  return [
    args.endpoint,
    args.subjectSlug,
    args.moduleSlug,
    args.locale,
    args.ownerKey,
    args.workspaceView,
    args.learnerId,
    args.assignmentId,
    args.submissionId,
  ]
    .map((value) => encodeURIComponent(String(value ?? "").trim()))
    .join("\u001f");
}

export function nextWorkspaceSaveRevision(args: {
  previousRevision: number;
  now?: number;
}) {
  const previous = Number.isFinite(args.previousRevision)
    ? Math.max(0, Math.trunc(args.previousRevision))
    : 0;
  const now = Number.isFinite(args.now)
    ? Math.max(0, Math.trunc(args.now!))
    : Date.now();

  return Math.max(previous + 1, now);
}

export function shouldApplyWorkspaceResponse(args: {
  expectedIdentity: string;
  responseIdentity: string;
  requestAborted: boolean;
  currentRevision: number;
  responseRevision: number;
  sameContent: boolean;
}) {
  if (args.requestAborted) return false;
  if (!args.expectedIdentity || args.responseIdentity !== args.expectedIdentity) {
    return false;
  }
  if (args.responseRevision < args.currentRevision) return false;
  if (args.responseRevision === args.currentRevision && args.sameContent) {
    return false;
  }
  return true;
}

export function shouldPersistWorkspaceMutation(args: {
  readOnly: boolean;
  hydrated: boolean;
  applyingRemote: boolean;
  hasAuthoritativeContent: boolean;
  wouldReplaceNonEmptyWithEmpty: boolean;
}) {
  return (
    !args.readOnly &&
    args.hydrated &&
    !args.applyingRemote &&
    args.hasAuthoritativeContent &&
    !args.wouldReplaceNonEmptyWithEmpty
  );
}
