/** A successful dependency bootstrap can need a follow-up after source reload.
 * This browser-local guard permits exactly one additional trusted attempt.
 * It does NOT authorize package installs: the existing server security,
 * signature, owner, source CAS, and runner capacity checks still decide.
 */
type RecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type SavedDependencyFollowUp = "initial" | "followup" | "final" | "exhausted";

export function claimSavedDependencyFollowUp(
  storage: RecoveryStorage,
  recoveryKey: string,
): SavedDependencyFollowUp {
  try {
    if (storage.getItem(recoveryKey) !== "completed") return "initial";
    const followUpKey = `${recoveryKey}:followup`;
    if (storage.getItem(followUpKey) !== "attempted") {
      // The second request is reserved before network work begins.
      storage.setItem(followUpKey, "attempted");
      return "followup";
    }
    // A verified bootstrap may have completed but not yet propagated through
    // the browser's saved-source hydration. The user's manual Retry currently
    // allows that final continuation. Do it once automatically instead, while
    // retaining a browser-persistent hard bound and all server authorizations.
    const finalKey = `${recoveryKey}:final`;
    if (storage.getItem(finalKey) === "attempted") return "exhausted";
    storage.setItem(finalKey, "attempted");
    return "final";
  } catch {
    // An unavailable store cannot enforce a bound across reloads.
    return "exhausted";
  }
}

export function clearSavedDependencyRecoveryGuards(
  storage: RecoveryStorage,
  recoveryKey: string,
): void {
  try {
    storage.removeItem(recoveryKey);
    storage.removeItem(`${recoveryKey}:followup`);
    storage.removeItem(`${recoveryKey}:final`);
  } catch { /* optional cleanup; no authorization from this state */ }
}
