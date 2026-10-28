import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";

/** Runtime/lock metadata are part of a running Vite process, not HMR content.
 * Changes must start a different preview container. No file is modified here.
 * The server remains the sole authority for approving package installation.
 */
const DEPENDENCY_PATHS = [
  "package.json",
  "pnpm-lock.yaml",
  "zoebuild-dependency-approval.json",
] as const;

export function previewDependencySnapshotChanged(
  previous: readonly WorkspaceSyncEntry[],
  current: readonly WorkspaceSyncEntry[],
): boolean {
  return DEPENDENCY_PATHS.some((path) => {
    const before = previous.find((entry) => entry.kind === "file" && entry.path === path);
    const after = current.find((entry) => entry.kind === "file" && entry.path === path);
    // Include presence and binary encoding as well as text bytes. Do not rely
    // on file node IDs or timestamps from one history snapshot to the next.
    return JSON.stringify(before ?? null) !== JSON.stringify(after ?? null);
  });
}
