/**
 * ZoeLearning administrative labs: fail-closed per-process operator gate.
 * Intentionally defaults OFF on every Runner boot; enabling the deployment
 * capability flag alone is never sufficient to launch a root-capable guest.
 *
 * The current Learning deployment has one Runner instance. For a future
 * multi-replica deployment this gate must be backed by a shared, atomic store.
 */
let enabled = false;
let generation = 0;

export type AdminLabSwitchStatus = Readonly<{enabled: boolean; generation: number}>;

export function adminLabSwitchStatus(): AdminLabSwitchStatus {
  return { enabled, generation };
}

export function setAdminLabSwitch(enabledNext: boolean): AdminLabSwitchStatus {
  // The operator route performs independent authentication before calling this.
  // Never allow runtime ON when the static deployment opt-in is OFF.
  if (enabledNext && process.env.ZOESKOUL_LEARNING_ADMIN_LABS_ENABLED !== "true") {
    throw new Error("Administrative learning labs are disabled.");
  }
  generation += 1; // always invalidate in-flight launch authorizations
  enabled = enabledNext;
  return adminLabSwitchStatus();
}

export function assertAdminLabSwitch(expectedGeneration?: number): number {
  if (!enabled || process.env.ZOESKOUL_LEARNING_ADMIN_LABS_ENABLED !== "true" ||
      (expectedGeneration !== undefined && expectedGeneration !== generation)) {
    throw new Error("Administrative learning labs are disabled.");
  }
  return generation;
}
