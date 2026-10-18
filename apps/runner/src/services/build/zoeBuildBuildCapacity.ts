/**
 * Single-process admission for trusted ZoeBuild one-shot executor jobs.
 *
 * One slot covers dependency lock bootstrap AND production builds. Both can
 * execute arbitrary generated code in restricted child containers, so the
 * learning runner must not accept unlimited parallel ZoeBuild work.
 *
 * The runner Compose topology currently has one runner instance. Scale-out
 * requires a distributed admission owner BEFORE adding runner replicas.
 * This is not a second executor and does not grant generated code a socket.
 */
export const MAX_ZOEBUILD_CONCURRENT_BUILDS = 1 as const;

let activeZoeBuilds = 0;

export class ZoeBuildBuildCapacityError extends Error {
  readonly code = "ZOEBUILD_BUILD_CAPACITY_EXHAUSTED" as const;

  constructor() {
    super("ZoeBuild build capacity reached. Try again later.");
    this.name = "ZoeBuildBuildCapacityError";
  }
}

export function zoeBuildBuildCapacitySnapshot(): Readonly<{
  active: number;
  limit: number;
}> {
  return {
    active: activeZoeBuilds,
    limit: MAX_ZOEBUILD_CONCURRENT_BUILDS,
  };
}

/** Reject excess work immediately. Never hold a slot after failure. */
export async function withZoeBuildBuildSlot<T>(
  execute: () => Promise<T>,
): Promise<T> {
  if (activeZoeBuilds >= MAX_ZOEBUILD_CONCURRENT_BUILDS) {
    throw new ZoeBuildBuildCapacityError();
  }

  activeZoeBuilds += 1;
  try {
    return await execute();
  } finally {
    activeZoeBuilds -= 1;
  }
}
