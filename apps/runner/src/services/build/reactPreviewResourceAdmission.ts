/** Runner-local queue and voluntary LRU reclamation for scarce preview slots.
 * Not a distributed admission controller. Keep one authoritative runner until
 * shared leases and session routing are implemented.
 */
export type PreviewReclaimCandidate = Readonly<{
  ownerKey: string;
  buildProjectId: string;
  lastActivityAt: number;
}>;

/** Never steal a recent preview from another actor. An owner's other project
 * may yield immediately, allowing normal project navigation with one slot.
 */
export function choosePreviewsToReclaim<T extends PreviewReclaimCandidate>(
  previews: readonly T[], actorKey: string, projectId: string,
  now: number, crossActorIdleMs: number,
): T[] {
  if (!Number.isFinite(now) || !Number.isFinite(crossActorIdleMs) || crossActorIdleMs < 0)
    throw new Error("Invalid preview reclamation clock.");
  return previews.filter(preview =>
    !(preview.ownerKey === actorKey && preview.buildProjectId === projectId) &&
    (preview.ownerKey === actorKey ||
      (Number.isFinite(preview.lastActivityAt) && now - preview.lastActivityAt >= crossActorIdleMs)),
  ).sort((a, b) => {
    const aOwn = a.ownerKey === actorKey ? 0 : 1;
    const bOwn = b.ownerKey === actorKey ? 0 : 1;
    return aOwn - bOwn || a.lastActivityAt - b.lastActivityAt;
  });
}

/** Limits both pending connections and how long they may wait for startup.
 * The request at the front owns the queue until it finishes, including Docker
 * cleanup. Timed-out waiters release only their own place in the queue.
 */
export class PreviewStartCoordinator {
  private tail: Promise<void> = Promise.resolve();
  private admitted = 0;
  constructor(private readonly maxAdmitted: number, private readonly maxWaitMs: number) {
    if (!Number.isSafeInteger(maxAdmitted) || maxAdmitted < 1 ||
        !Number.isSafeInteger(maxWaitMs) || maxWaitMs < 1) throw new Error("Invalid queue limits.");
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.admitted >= this.maxAdmitted)
      throw new Error("Runner is busy. Preview queue is full.");
    this.admitted += 1;
    let release!: () => void;
    const turn = new Promise<void>(resolve => { release = resolve; });
    const ahead = this.tail;
    this.tail = ahead.then(() => turn);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        ahead,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("Runner is busy. Preview wait timed out.")),
            this.maxWaitMs);
        }),
      ]);
      if (timer) clearTimeout(timer);
      return await work();
    } finally {
      if (timer) clearTimeout(timer);
      release();
      this.admitted -= 1;
    }
  }

  resetForTests() {
    if (this.admitted !== 0) throw new Error("Cannot reset active preview admissions.");
    this.tail = Promise.resolve();
  }
}
