import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { exportWorkspaceEntries } from "@zoeskoul/learner-workspace/ide/fsTree";
import { workspaceSyncEntriesEqual } from "@zoeskoul/learner-workspace/lib/projects/workspaceSyncEntries";

/** A sourceVersion token is necessary but not sufficient. Preview execution
 * accepts only the exact bytes stored under that server-owned version. */
export function previewWorkspaceMatchesSavedSource(
  saved: WorkspaceStateV2,
  submitted: WorkspaceStateV2,
): boolean {
  return saved.language === submitted.language &&
    workspaceSyncEntriesEqual(
      exportWorkspaceEntries(saved.nodes),
      exportWorkspaceEntries(submitted.nodes),
    );
}
