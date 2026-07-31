export {
  WORKSPACE_PROGRESS_SAVE_DEBOUNCE_MS,
  WORKSPACE_RUNTIME_SAVE_COALESCE_MS,
  WORKSPACE_TEXT_SAVE_DEBOUNCE_MS,
  buildCanonicalWorkspaceIdentity,
  nextWorkspaceSaveRevision,
  shouldApplyWorkspaceResponse,
  shouldPersistWorkspaceMutation,
} from "@zoeskoul/workspace-contracts";

export type {
  CanonicalWorkspaceIdentityInput,
} from "@zoeskoul/workspace-contracts";

export {
  preserveLocalWorkspaceNavigation,
  savedStarterHashMatchesRuntimeStarter,
  workspaceContentHash,
} from "@zoeskoul/workspace-contracts";
