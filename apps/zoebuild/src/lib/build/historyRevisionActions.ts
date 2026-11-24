/** Guard history actions using server-advertised capabilities, not a guessed
 * stack name. The API still enforces all source and asset security boundaries.
 */
export function canSwitchHistoryRevision(
  stackId: string, revision: Readonly<{restoreAvailable?:boolean}> | null | undefined,
): boolean {
  if (!revision) return false;
  if (stackId === "react-vite-v1") return true;
  return stackId === "tanstack-start-v1" && revision.restoreAvailable === true;
}

/** Immutable managed R2 history cannot be deleted through the legacy route. */
export function canDeleteHistoryRevision(stackId: string): boolean {
  return stackId === "react-vite-v1";
}
