import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { PROJECT_DEPENDENCY_APPROVAL_PATH, canonicalProjectDependencyManifest } from "@zoeskoul/build-preparation";

/** A newly saved package.json cannot carry an approval for an older manifest.
 * This runs only when the owner explicitly saves source, never on preview.
 * A lock-only change or a forged signature with the SAME manifest remains
 * untouched so verification detects it rather than silently repairing it.
 */
export function invalidateManagedDependenciesOnManifestEdit(
  previous: WorkspaceStateV2, incoming: WorkspaceStateV2,
): WorkspaceStateV2 {
  const root = (ws: WorkspaceStateV2, name: string) => ws.nodes.find(
    node => node.kind === "file" && node.parentId === null && node.name === name,
  );
  const before = root(previous, "package.json");
  const after = root(incoming, "package.json");
  if (before?.kind !== "file" || after?.kind !== "file" ||
      before.content === after.content) return incoming;
  try {
    // Formatting, description and build-script edits are not dependency
    // changes. They should not trigger a reinstall or replace a valid lock.
    if (canonicalProjectDependencyManifest(before.content) ===
        canonicalProjectDependencyManifest(after.content)) return incoming;
  } catch { /* Invalid new manifests remain blocked at preview preparation. */ }
  const managed = new Set(["pnpm-lock.yaml", PROJECT_DEPENDENCY_APPROVAL_PATH]);
  const discard = new Set(incoming.nodes.filter(node => node.kind === "file" &&
    node.parentId === null && managed.has(node.name)).map(node => node.id));
  if (!discard.size) return incoming;
  return {
    ...incoming,
    nodes: incoming.nodes.filter(node => !discard.has(node.id)),
    openTabs: incoming.openTabs.filter(id => !discard.has(id)),
    activeFileId: discard.has(incoming.activeFileId) ? after.id : incoming.activeFileId,
    entryFileId: discard.has(incoming.entryFileId) ? after.id : incoming.entryFileId,
  };
}
