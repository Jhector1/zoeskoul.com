import type { WorkspaceLanguage } from "@zoeskoul/curriculum-contracts";

export const REVIEW_WORKSPACE_VIEWS = [
  "master",
  "reference",
  "mine",
  "learner",
] as const;

export type ReviewWorkspaceView =
  (typeof REVIEW_WORKSPACE_VIEWS)[number];

export type ReviewWorkspaceCapabilities = {
  /** Whether the mounted code/sketch/board workspace accepts edits. */
  canEditWorkspace: boolean;
  /** Whether answer checks, reveals, hints, or AI-tutor practice actions may run. */
  canSubmitPractice: boolean;
  /** Whether quiz state, completion, reset, and progress may be changed. */
  canMutateProgress: boolean;
  /** Whether learner completion controls which content can be opened next. */
  usesProgressGating: boolean;
};

export const DEFAULT_REVIEW_WORKSPACE_CAPABILITIES:
  ReviewWorkspaceCapabilities = {
    canEditWorkspace: true,
    canSubmitPractice: true,
    canMutateProgress: true,
    usesProgressGating: true,
  };

export function resolveReviewWorkspaceCapabilities(
  value:
    | Partial<ReviewWorkspaceCapabilities>
    | null
    | undefined,
): ReviewWorkspaceCapabilities {
  return {
    ...DEFAULT_REVIEW_WORKSPACE_CAPABILITIES,
    ...(value ?? {}),
  };
}

/**
 * Tutoring workspaces separate observation from ownership.
 *
 * - A tutor observing a learner, or anyone viewing tutor/reference content,
 *   can navigate freely but cannot mutate the viewed owner's state.
 * - A learner's private "Mine" workspace keeps normal progress gating.
 * - A tutor's editable master workspace is authoring/teaching space and is not
 *   trapped by learner completion gates.
 */
export function resolveTutoringReviewWorkspaceCapabilities(
  args: {
    canManage: boolean;
    canEdit: boolean;
    workspaceView: ReviewWorkspaceView;
  },
): ReviewWorkspaceCapabilities {
  const canMutate = Boolean(args.canEdit);

  return {
    canEditWorkspace: canMutate,
    canSubmitPractice: canMutate,
    canMutateProgress: canMutate,
    usesProgressGating:
      !args.canManage &&
      args.workspaceView === "mine",
  };
}


export type NodeId = string;

export type FolderNode = {
  id: NodeId;
  kind: "folder";
  name: string;
  parentId: NodeId | null;
  createdAt: number;
  updatedAt: number;
};

export type BinaryFileContent = {
  encoding: "base64";
  data: string;
  mimeType: string;
  sizeBytes: number;
  checksum?: string;
};

export type FileNode = {
  id: NodeId;
  kind: "file";
  name: string;
  parentId: NodeId | null;
  /** UTF-8 content for Monaco-editable text files. Empty for binary files. */
  content: string;
  /** Binary bytes stay outside Monaco and are rendered by a dedicated viewer. */
  binary?: BinaryFileContent;
  createdAt: number;
  updatedAt: number;
};

export type FSNode = FolderNode | FileNode;

export type WorkspaceStateV2 = {
  version: 2;
  language: WorkspaceLanguage;
  nodes: FSNode[];
  openTabs: NodeId[];
  activeFileId: NodeId;
  entryFileId: NodeId;
  stdin: string;
  expanded: NodeId[];
  leftPct: number;
};

/**
 * Shared timing and ordering rules for every persisted learning workspace.
 *
 * The editor-to-runtime hop owns the text debounce. The runtime-to-database
 * hop must not add another long delay. Structural mutations are coalesced
 * within the current task and then saved immediately.
 */
export const WORKSPACE_TEXT_SAVE_DEBOUNCE_MS = 600;
export const WORKSPACE_PROGRESS_SAVE_DEBOUNCE_MS = 600;
export const WORKSPACE_RUNTIME_SAVE_COALESCE_MS = 0;

export type CanonicalWorkspaceIdentityInput = {
  endpoint: string;
  subjectSlug: string;
  moduleSlug: string;
  locale: string;
  ownerKey?: string | null;
  workspaceView?: string | null;
  learnerId?: string | null;
  assignmentId?: string | null;
  submissionId?: string | null;
};

export function buildCanonicalWorkspaceIdentity(
  args: CanonicalWorkspaceIdentityInput,
): string {
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
    .map((value) =>
      encodeURIComponent(String(value ?? "").trim()),
    )
    .join("\u001f");
}

export function nextWorkspaceSaveRevision(args: {
  previousRevision: number;
  now?: number;
}): number {
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
}): boolean {
  if (args.requestAborted) return false;

  if (
    !args.expectedIdentity ||
    args.responseIdentity !== args.expectedIdentity
  ) {
    return false;
  }

  if (args.responseRevision < args.currentRevision) {
    return false;
  }

  if (
    args.responseRevision === args.currentRevision &&
    args.sameContent
  ) {
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
}): boolean {
  return (
    !args.readOnly &&
    args.hydrated &&
    !args.applyingRemote &&
    args.hasAuthoritativeContent &&
    !args.wouldReplaceNonEmptyWithEmpty
  );
}
