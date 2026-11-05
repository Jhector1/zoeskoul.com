/** Canonical live TanStack full-stack preview leases. All preview admission,
 * cancellation, cleanup and project deletion share this single registry.
 * This is one in-process Runner owner; multi-replica support requires external leases.
 */
export type FullStackPreviewLease = Readonly<{
  id: string;
  ownerKey: string;
  buildProjectId: string;
  sourceVersion: number;
  containerId: string;
  basePath: string;
  createdAt: number;
  lastActivityAt: number;
  close(): Promise<void>;
}>;

export class SharedFullStackPreviewRegistry {
  private readonly live = new Map<string, FullStackPreviewLease>();
  private readonly closing = new Map<string, Promise<void>>();

  get(id: string) { return this.live.get(id) ?? null; }
  list() { return [...this.live.values()]; }
  count() { return this.live.size; }
  countForOwner(ownerKey: string) {
    return this.list().filter(item => item.ownerKey === ownerKey).length;
  }
  register(lease: FullStackPreviewLease) {
    if (!lease.id || !lease.ownerKey || !lease.buildProjectId || this.live.has(lease.id))
      throw new Error("Invalid full-stack preview lease.");
    this.live.set(lease.id, lease);
  }
  touch(id: string, at: number) {
    const lease = this.live.get(id);
    if (lease && Number.isFinite(at)) this.live.set(id, {...lease, lastActivityAt: at});
  }
  async close(id: string): Promise<boolean> {
    const lease = this.live.get(id);
    if (!lease) return false;
    const pending = this.closing.get(id);
    if (pending) { await pending; return true; }
    // Keep the reservation counted until Docker and the workspace both exit.
    // If removal fails, leave it counted so a replacement cannot overcommit.
    const task = (async () => { await lease.close(); this.live.delete(id); })();
    this.closing.set(id, task);
    try { await task; return true; }
    finally { if (this.closing.get(id) === task) this.closing.delete(id); }
  }
  async drain(ownerKey: string, buildProjectId: string) {
    let removed = 0;
    for (const lease of this.list()) {
      if (lease.ownerKey === ownerKey && lease.buildProjectId === buildProjectId) {
        await this.close(lease.id);
        removed++;
      }
    }
    return removed;
  }
  async sweep(now: number, idleMs: number, hardMs: number) {
    for (const lease of this.list()) {
      if (now - lease.lastActivityAt >= idleMs || now - lease.createdAt >= hardMs)
        await this.close(lease.id);
    }
  }
  /** Only safe when all preview operations are already settled (test teardown). */
  resetForTests() {
    if (this.closing.size) throw new Error("Cannot reset active preview cleanup.");
    this.live.clear();
  }
}
export const sharedFullStackPreviews = new SharedFullStackPreviewRegistry();
