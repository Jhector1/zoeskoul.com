import { previewObservability } from "./previewObservability.js";
import type { TanstackPreviewIdentity } from "./tanstackPreviewIdentity.js";

/** Canonical live TanStack full-stack preview leases. All preview admission,
 * cancellation, cleanup and project deletion share this single registry.
 * This is one in-process Runner owner; multi-replica support requires external leases.
 */
export type FullStackPreviewLease = Readonly<{
  id: string;
  ownerKey: string;
  buildProjectId: string;
  sourceVersion: number;
  identity: TanstackPreviewIdentity;
  containerId: string;
  basePath: string;
  createdAt: number;
  lastActivityAt: number;
  close(): Promise<void>;
}>;

export class SharedFullStackPreviewRegistry {
  private readonly live = new Map<string, FullStackPreviewLease>();
  private readonly closing = new Map<string, Promise<void>>();
  private readonly healthChecks = new Map<string, Promise<boolean>>();

  get(id: string) { return this.live.get(id) ?? null; }
  list() { return [...this.live.values()]; }
  count() { return this.live.size; }
  snapshot() {
    const quarantined = this.list().filter(item => item.basePath.startsWith("/quarantined/")).length;
    return {
      active: Math.max(0, this.live.size - quarantined),
      closing: this.closing.size,
      quarantined,
      totalReserved: this.live.size,
    } as const;
  }
  countForOwner(ownerKey: string) {
    return this.list().filter(item => item.ownerKey === ownerKey).length;
  }
  register(lease: FullStackPreviewLease) {
    if (!lease.id || !lease.ownerKey || !lease.buildProjectId ||
        !lease.identity?.fingerprint || this.live.has(lease.id))
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
    let settle!: () => void;
    let fail!: (error: unknown) => void;
    const marker = new Promise<void>((resolve, reject) => { settle = resolve; fail = reject; });
    // Publish the close intent synchronously. A health check already in flight
    // will reject reuse, and cleanup waits for that bounded check to finish.
    this.closing.set(id, marker);
    const endCleanup = previewObservability.beginCleanup();
    const task = (async () => {
      const healthCheck = this.healthChecks.get(id);
      if (healthCheck) await healthCheck.catch(() => false);
      await lease.close();
      this.live.delete(id);
    })();
    void task.then(() => endCleanup("ok"), () => endCleanup("error"));
    void task.then(settle, fail);
    try { await marker; return true; }
    finally { if (this.closing.get(id) === marker) this.closing.delete(id); }
  }

  /** Returns only an exact, live, freshly checked lease. Concurrent identical
   * claims share one bounded health check. A close intent always wins so a
   * stopped preview cannot be resurrected by a late health response.
   */
  async claimReusable(input: Readonly<{
    ownerKey: string;
    buildProjectId: string;
    sourceVersion: number;
    identity: TanstackPreviewIdentity;
    maxLifetimeMs: number;
    healthCheck: (lease: FullStackPreviewLease) => Promise<boolean>;
  }>): Promise<FullStackPreviewLease | null> {
    const lease = this.list().find(candidate =>
      candidate.ownerKey === input.ownerKey &&
      candidate.buildProjectId === input.buildProjectId &&
      candidate.sourceVersion === input.sourceVersion &&
      candidate.identity.fingerprint === input.identity.fingerprint &&
      candidate.identity.sourceFingerprint === input.identity.sourceFingerprint &&
      candidate.identity.dependencyFingerprint === input.identity.dependencyFingerprint &&
      candidate.identity.runtimeImageId === input.identity.runtimeImageId &&
      Number.isFinite(input.maxLifetimeMs) && input.maxLifetimeMs > 0 &&
      Date.now()-candidate.createdAt < input.maxLifetimeMs &&
      !candidate.basePath.startsWith("/quarantined/")) ?? null;
    if (!lease) return null;
    const healthy = await this.checkLive(lease.id,input.healthCheck);
    if (!healthy) return null;
    previewObservability.recordLeaseReuse();
    return this.live.get(lease.id) ?? null;
  }

  /** Serializes bounded liveness checks with cleanup. This does not authorize
   * reuse by itself; callers must first verify owner/project/source identity. */
  async checkLive(id: string, healthCheck: (lease: FullStackPreviewLease) => Promise<boolean>) {
    const lease = this.live.get(id);
    if (!lease || lease.basePath.startsWith("/quarantined/") || this.closing.has(id)) return false;
    let check = this.healthChecks.get(id);
    if (!check) {
      check = Promise.resolve().then(() => healthCheck(lease)).then(Boolean, () => false);
      this.healthChecks.set(id, check);
      void check.finally(() => {
        if (this.healthChecks.get(id) === check) this.healthChecks.delete(id);
      }).catch(() => undefined);
    }
    const healthy = await check;
    if (!healthy || this.closing.has(id) || this.live.get(id) !== lease) return false;
    this.touch(id,Date.now());
    return true;
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
    if (this.closing.size || this.healthChecks.size) throw new Error("Cannot reset active preview cleanup.");
    this.live.clear();
  }
}
export const sharedFullStackPreviews = new SharedFullStackPreviewRegistry();
