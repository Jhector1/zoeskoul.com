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
let activeStartedAt: number | null = null;

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
  activeStartedAt = Date.now();
  try {
    return await execute();
  } finally {
    releaseBootstrapSlot();
  }
}

/**
 * Bootstrap requests share the build budget with production builds, but a
 * short FIFO wait avoids rejecting a saved version simply because another
 * trusted job was already running. No additional Docker work is admitted.
 *
 * Exact duplicate requests (including actor and source bytes) share one
 * execution. A queue item is removed on success, error, or timeout.
 */
export const ZOEBUILD_BOOTSTRAP_MAX_WAITING = 3 as const;
export const ZOEBUILD_BOOTSTRAP_QUEUE_WAIT_MS = 30_000 as const;

type QueuedBootstrapWaiter = {
  resolve: () => void;
  reject: (reason: ZoeBuildBuildCapacityError) => void;
  timeout: ReturnType<typeof setTimeout>;
};

const bootstrapQueue: QueuedBootstrapWaiter[] = [];
const bootstrapFlights = new Map<string, Promise<unknown>>();

export function zoeBuildBootstrapQueueSnapshot(): Readonly<{
  waiting: number;
  duplicateKeys: number;
  activeMs: number;
}> {
  return { waiting: bootstrapQueue.length, duplicateKeys: bootstrapFlights.size,
    activeMs: activeStartedAt === null ? 0 : Math.max(0, Date.now() - activeStartedAt) };
}

async function acquireBootstrapSlot(): Promise<void> {
  if (activeZoeBuilds === 0 && bootstrapQueue.length === 0) {
    activeZoeBuilds = 1;
    activeStartedAt = Date.now();
    return;
  }
  if (bootstrapQueue.length >= ZOEBUILD_BOOTSTRAP_MAX_WAITING) {
    throw new ZoeBuildBuildCapacityError();
  }
  await new Promise<void>((resolve, reject) => {
    const waiter: QueuedBootstrapWaiter = {
      resolve,
      reject,
      timeout: setTimeout(() => {
        const index = bootstrapQueue.indexOf(waiter);
        if (index >= 0) bootstrapQueue.splice(index, 1);
        reject(new ZoeBuildBuildCapacityError());
      }, ZOEBUILD_BOOTSTRAP_QUEUE_WAIT_MS),
    };
    bootstrapQueue.push(waiter);
  });
  // The preceding job transfers ownership directly; the active counter stays
  // at 1, closing the gap in which an unrelated build could jump the queue.
}

function releaseBootstrapSlot(): void {
  const next = bootstrapQueue.shift();
  if (next) {
    clearTimeout(next.timeout);
    activeStartedAt = Date.now();
    next.resolve();
  } else {
    activeZoeBuilds -= 1;
    activeStartedAt = null;
  }
}

export function withZoeBuildQueuedBootstrapSlot<T>(
  requestKey: string,
  execute: () => Promise<T>,
): Promise<T> {
  if (!requestKey || requestKey.length > 128) {
    throw new Error("Invalid trusted bootstrap idempotency key.");
  }
  const existing = bootstrapFlights.get(requestKey);
  if (existing) return existing as Promise<T>;

  const flight = (async (): Promise<T> => {
    await acquireBootstrapSlot();
    try {
      return await execute();
    } finally {
      releaseBootstrapSlot();
    }
  })();
  bootstrapFlights.set(requestKey, flight);
  // Returning the same settled promise to all callers is safe: each API
  // caller validates its own owner and source-version CAS before invoking us.
  void flight.then(
    () => { if (bootstrapFlights.get(requestKey) === flight) bootstrapFlights.delete(requestKey); },
    () => { if (bootstrapFlights.get(requestKey) === flight) bootstrapFlights.delete(requestKey); },
  );
  return flight;
}
