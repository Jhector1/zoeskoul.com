/** Process-local, runner-owned admission for ZoeBuild React/Vite previews. */
export const ZOEBUILD_MAX_CONCURRENT_PREVIEWS = 1 as const;

export class ZoeBuildPreviewCapacityError extends Error {
  constructor() {
    super("Runner is busy. ZoeBuild allows one active or starting preview.");
    this.name = "ZoeBuildPreviewCapacityError";
  }
}

/** Include both starting reservations and live containers to close startup races. */
export function assertZoeBuildPreviewCapacity(
  livePreviewCount: number,
  pendingStartCount: number,
): void {
  if (
    !Number.isSafeInteger(livePreviewCount) || livePreviewCount < 0 ||
    !Number.isSafeInteger(pendingStartCount) || pendingStartCount < 0
  ) {
    throw new Error("Invalid ZoeBuild preview admission counters.");
  }
  if (livePreviewCount + pendingStartCount >= ZOEBUILD_MAX_CONCURRENT_PREVIEWS) {
    throw new ZoeBuildPreviewCapacityError();
  }
}
