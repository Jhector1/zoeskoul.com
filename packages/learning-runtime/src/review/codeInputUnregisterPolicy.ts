/**
 * A React cleanup may run after an authoritative reset has already discarded
 * the old ReviewTools registry entry. That cleanup no longer owns the runtime
 * binding and must not schedule a deferred unbind.
 */
export function shouldScheduleReviewCodeInputUnregister(
  capturedRegistration: unknown,
): boolean {
  return capturedRegistration != null;
}

/**
 * Deferred unregister is owner-scoped. If the same id was re-registered before
 * the timeout runs, the old cleanup must not delete the new registration or
 * unbind its canonical runtime owner.
 */
export function shouldApplyDeferredReviewCodeInputUnregister(args: {
  capturedRegistration: unknown;
  currentRegistration: unknown;
}): boolean {
  return (
    args.capturedRegistration != null &&
    args.currentRegistration === args.capturedRegistration
  );
}
