import { UnifiedLinuxReservationStore } from './unifiedLinuxReservationStore.js';
import { detachedGuestMarker } from './adminLabGuestLifecycle.js';

export const unifiedVolumeMarker = 'com.zoeskoul.learning.unified-workspace';
export type ResourceLabels = { Labels?: Record<string, string> | null };

/** Fail closed until restart adoption and expiry/revocation are implemented.
 * A marker of ANY value is evidence of a possibly recoverable resource. */
export function assertNoUnifiedStartupResources(rows: readonly ResourceLabels[]): void {
  if (rows.some(row => row.Labels && (
    Object.prototype.hasOwnProperty.call(row.Labels, detachedGuestMarker) ||
    Object.prototype.hasOwnProperty.call(row.Labels, unifiedVolumeMarker)))) {
    throw new Error('UNIFIED_LINUX_STARTUP_RECOVERY_REQUIRED');
  }
}

/** The host-owned directory must remain configured even while admission is off.
 * Never infer absence from an inaccessible, missing or corrupted inventory. */
export function assertUnifiedStartupReservations(config: NodeJS.ProcessEnv = process.env): void {
  const root = config.ZOESKOUL_LEARNING_UNIFIED_RESERVATION_ROOT;
  if (root !== undefined && new UnifiedLinuxReservationStore(root).inventory().length !== 0) {
    throw new Error('UNIFIED_LINUX_STARTUP_RECOVERY_REQUIRED');
  }
  if (config.ZOESKOUL_LEARNING_UNIFIED_DETACHED_DEV === 'true') {
    throw new Error('UNIFIED_LINUX_STARTUP_ADMISSION_NOT_READY');
  }
}
