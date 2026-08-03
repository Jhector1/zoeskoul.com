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

export function workspaceContentHash(workspace: any) {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return "null";
    }

    const files = workspace.nodes
        .filter((node: any) => node?.kind === "file")
        .map((node: any) => ({
            id: String(node.id ?? ""),
            name: String(node.name ?? ""),
            content: String(node.content ?? ""),
        }))
        .sort((a: any, b: any) => a.id.localeCompare(b.id));

    return JSON.stringify({
        version: 2,
        language: workspace.language ?? null,
        stdin: typeof workspace.stdin === "string" ? workspace.stdin : "",
        entryFileId: workspace.entryFileId ?? null,
        activeFileId: workspace.activeFileId ?? null,
        files,
    });
}

export function preserveLocalWorkspaceNavigation(
    incomingWorkspace: any,
    localWorkspace: any,
) {
    if (
        !incomingWorkspace ||
        incomingWorkspace.version !== 2 ||
        !Array.isArray(incomingWorkspace.nodes) ||
        !localWorkspace ||
        localWorkspace.version !== 2 ||
        !Array.isArray(localWorkspace.nodes)
    ) {
        return incomingWorkspace;
    }

    const incomingIds = new Set(
        incomingWorkspace.nodes.map((node: any) => String(node?.id ?? "")),
    );
    const localActiveFileId = String(localWorkspace.activeFileId ?? "");
    const activeFileId = incomingIds.has(localActiveFileId)
        ? localActiveFileId
        : incomingWorkspace.activeFileId;
    const localTabs = Array.isArray(localWorkspace.openTabs)
        ? localWorkspace.openTabs.filter((id: unknown) => incomingIds.has(String(id)))
        : [];
    const incomingTabs = Array.isArray(incomingWorkspace.openTabs)
        ? incomingWorkspace.openTabs
        : [];

    return {
        ...incomingWorkspace,
        activeFileId,
        openTabs: [...new Set([...localTabs, ...incomingTabs])],
        expanded: Array.isArray(localWorkspace.expanded)
            ? localWorkspace.expanded
            : incomingWorkspace.expanded,
    };
}

export function savedStarterHashMatchesRuntimeStarter(args: {
    saved: any;
    existingStarterHash?: string | null;
    existingWorkspace?: any;
}) {
    const savedStarterHash =
        typeof args.saved?.starterHash === "string" ? args.saved.starterHash : "";

    if (!savedStarterHash) {
        return false;
    }

    const runtimeStarterHash =
        typeof args.existingStarterHash === "string" && args.existingStarterHash
            ? args.existingStarterHash
            : workspaceContentHash(args.existingWorkspace);

    return savedStarterHash === runtimeStarterHash;
}

export function shouldTrackReviewRuntimeMutation(args: {
    readOnly: boolean;
    applyingRemote: boolean;
}) {
    return shouldPersistWorkspaceMutation({
        readOnly: args.readOnly,
        hydrated: true,
        applyingRemote: args.applyingRemote,
        hasAuthoritativeContent: true,
        wouldReplaceNonEmptyWithEmpty: false,
    });
}

export function canPollReviewRemoteProgress(args: {
    readOnly: boolean;
    localDirty: boolean;
    remoteSyncInFlight: boolean;
    saveInFlight: boolean;
    hasPendingSave: boolean;
}) {
    if (args.remoteSyncInFlight || args.saveInFlight) return false;

    // A read-only workspace cannot own local edits. Runtime churn caused by
    // mounting Monaco, rebinding Tools, or hydrating a remote workspace must
    // never prevent it from receiving the tutor's next saved snapshot.
    if (args.readOnly) return true;

    return !args.localDirty && !args.hasPendingSave;
}

export function shouldApplyRemoteReviewWorkspace(args: {
    readOnly: boolean;
    reason: string;
    looksLikeBetterCandidate: boolean;
}) {
    const isRemoteRefresh =
        args.reason !== "initial" && args.reason !== "runtime-contract-ready";

    // In a read-only master/reference/learner view, the server-owned snapshot is
    // authoritative even when the tutor's newest code is shorter than the old
    // code. Editable learner work still keeps the conservative restore guard.
    return (args.readOnly && isRemoteRefresh) || args.looksLikeBetterCandidate;
}

export function getWorkspaceEntryCode(
  workspace: any,
): string | null {
  if (
    !workspace ||
    workspace.version !== 2 ||
    !Array.isArray(workspace.nodes)
  ) {
    return null;
  }

  const entryId =
    workspace.entryFileId ||
    workspace.activeFileId;
  const file =
    workspace.nodes.find(
      (node: any) =>
        node?.kind === "file" &&
        node?.id === entryId,
    ) ??
    workspace.nodes.find(
      (node: any) =>
        node?.kind === "file",
    );

  return file?.kind === "file"
    ? String(file.content ?? "")
    : null;
}
