/** A saved source revision is a CAS token, not necessarily the version the user selected.
 * A history restore keeps version numbers immutable and monotonically increasing
 * while the active selection points at the original user-selected snapshot.
 * Selection metadata is valid only for the exact source head that recorded it:
 * subsequent normal saves automatically make the newly saved revision current.
 */
export function activeSavedHistoryVersion(
  sourceVersion: number, meta: unknown,
): number {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return sourceVersion;
  const value = meta as Record<string, unknown>;
  const selected = value.activeHistoryVersion;
  if (Number.isSafeInteger(selected) && (selected as number) >= 1 &&
      (selected as number) <= sourceVersion &&
      value.activeHistorySourceVersion === sourceVersion) {
    return selected as number;
  }
  // Backwards compatibility for already-installed K restores (such as v15
  // restored from v2), before this active-selection marker was introduced.
  if (value.lastMutation === "history-restore" &&
      value.restoredSnapshotVersion === sourceVersion &&
      Number.isSafeInteger(value.restoredFromVersion) &&
      (value.restoredFromVersion as number) >= 1 &&
      (value.restoredFromVersion as number) <= sourceVersion) {
    return value.restoredFromVersion as number;
  }
  return sourceVersion;
}
