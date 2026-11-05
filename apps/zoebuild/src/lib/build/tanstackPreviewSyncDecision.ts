import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import { workspaceSyncEntriesEqual } from "@zoeskoul/learner-workspace/lib/projects/workspaceSyncEntries";

/**
 * TanStack server routes/functions execute from an immutable saved-source lease.
 * Never mutate a running lease. Never upload unsaved editor buffers to Runner.
 */
export function decideTanstackPreviewSync(input: Readonly<{
  sessionSourceVersion: number;
  selectedSourceVersion: number;
  sessionEntries: readonly WorkspaceSyncEntry[];
  selectedEntries: readonly WorkspaceSyncEntry[];
  hasUnsavedChanges: boolean;
}>): "hold" | "unchanged" | "restart" {
  if (input.hasUnsavedChanges) return "hold";
  if (input.sessionSourceVersion !== input.selectedSourceVersion) return "restart";
  return workspaceSyncEntriesEqual(
    [...input.sessionEntries], [...input.selectedEntries],
  ) ? "unchanged" : "restart";
}
