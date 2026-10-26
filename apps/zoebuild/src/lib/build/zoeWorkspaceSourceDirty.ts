import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { exportWorkspaceEntries, pathOf } from "@zoeskoul/learner-workspace/ide/fsTree";
import { workspaceSyncEntriesEqual } from "@zoeskoul/learner-workspace/lib/projects/workspaceSyncEntries";

/**
 * Source-only comparison: focus, tabs, node timestamps and other editor metadata
 * must not create a phantom unsaved-change warning. All source file contents,
 * binary entries and even empty directory paths remain write-sensitive.
 * Reuse the established live-preview source equality rather than duplicating it.
 */
export function hasUnsavedZoeWorkspaceSource(
  saved: WorkspaceStateV2,
  current: WorkspaceStateV2,
): boolean {
  if (!workspaceSyncEntriesEqual(
    exportWorkspaceEntries(saved.nodes),
    exportWorkspaceEntries(current.nodes),
  )) return true;

  const folderPaths = (workspace: WorkspaceStateV2): string[] =>
    workspace.nodes
      .filter(node => node.kind === "folder")
      .map(node => pathOf(workspace.nodes, node.id))
      .sort();
  const a = folderPaths(saved);
  const b = folderPaths(current);
  return a.length !== b.length || a.some((path, index) => path !== b[index]);
}
