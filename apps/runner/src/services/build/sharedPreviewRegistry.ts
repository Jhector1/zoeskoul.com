import { previewObservability } from "./previewObservability.js";
import type { TanstackPreviewLeaseMode } from "@zoeskoul/build-executor-contracts";
import type { TanstackPreviewIdentity } from "./tanstackPreviewIdentity.js";

/** Canonical live TanStack full-stack preview leases. All preview admission,
 * cancellation, cleanup and project deletion share this single registry.
 * This is one in-process Runner owner; multi-replica support requires external leases.
 */
export type FullStackPreviewLease = Readonly<{
  id: string;
  /** Legacy callers remain immutable. No development lease is created by existing routes. */
  mode?: TanstackPreviewLeaseMode;
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

export type PreviewLifecycleState = "idle" | "starting" | "ready" |
  "updating" | "recovering" | "closing" | "controlled_fallback";

export class SharedFullStackPreviewRegistry {
  private readonly live = new Map<string, FullStackPreviewLease>();
  private readonly closing = new Map<string, Promise<void>>();
  private readonly healthChecks = new Map<string, Promise<boolean>>();
  /** Exclusive per-lease updates; always account for pending updates on close. */
  private readonly updates = new Map<string, Promise<void>>();
  private readonly activeUpdates = new Set<string>();
  private readonly startingProjects = new Set<string>();

  private projectKey(ownerKey: string, buildProjectId: string) {
    if (!ownerKey || !buildProjectId) throw new Error("Preview identity required.");
    return `${ownerKey}\0${buildProjectId}`;
  }
  beginProjectStart(ownerKey: string, buildProjectId: string): () => void {
    const key = this.projectKey(ownerKey,buildProjectId);
    if (this.startingProjects.has(key)) throw new Error("Preview project transition already active.");
    this.startingProjects.add(key);
    let finished=false;
    return () => {
      if (finished) return;
      finished=true;
      this.startingProjects.delete(key);
    };
  }
  stateForProject(ownerKey: string, buildProjectId: string): PreviewLifecycleState {
    const key=this.projectKey(ownerKey,buildProjectId);
    if(this.startingProjects.has(key)) return "starting";
    const leases=this.list().filter(lease=>lease.ownerKey===ownerKey &&
      lease.buildProjectId===buildProjectId);
    if(leases.some(lease=>this.closing.has(lease.id))) return "closing";
    if(leases.some(lease=>lease.basePath.startsWith("/quarantined/"))) return "recovering";
    if(leases.some(lease=>this.updates.has(lease.id))) return "updating";
    if(leases.some(lease=>lease.mode==="development")) return "ready";
    if(leases.some(lease=>lease.mode==="immutable")) return "controlled_fallback";
    return "idle";
  }

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
    const mode = lease.mode ?? "immutable";
    if (mode !== "immutable" && mode !== "development")
      throw new Error("Invalid full-stack preview lease mode.");
    // Normalize legacy callers explicitly to immutable; all capacity and close
    // accounting remains shared across both modes.
    this.live.set(lease.id, { ...lease, mode });
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
      // Closing intent is published before waiting; an in-progress update may
      // finish its write but can never commit a new revision after close begins.
      const update = this.updates.get(id);
      if (update) await update;
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

  /** The legacy immutable-preview transport must never serve a development
   * lease while writes are pending. The future development transport must use
   * an owner-authenticated route with its own update-aware read boundary. */
  developmentUpdatePending(id: string) { return this.updates.has(id); }
  /** Wait for the already-published update fence without authorizing reuse.
   * Callers must re-read authority and lease identity after this resolves. */
  async waitForDevelopmentSettled(id:string):Promise<FullStackPreviewLease|null> {
    const pending=this.updates.get(id);
    if(pending)await pending;
    const lease=this.live.get(id)??null;
    if(!lease || lease.mode!=="development" || this.closing.has(id) ||
        lease.basePath.startsWith("/quarantined/"))return null;
    return lease;
  }

  /** Phase 4E2: a read-only, owner-bound development request is permitted only
   * outside every update/close slot. This is NOT bearer-capability admission.
   * The caller rechecks this fence after the sandbox HTTP read returns so a
   * concurrent revision commit cannot release stale or partially written data.
   */
  assertDevelopmentReadOpen(input: Readonly<{
    previewId: string; ownerKey: string; buildProjectId: string;
    sourceVersion: number;
  }>): FullStackPreviewLease {
    const lease = this.live.get(input.previewId);
    if (!lease || lease.mode !== "development" ||
        !lease.ownerKey || lease.ownerKey !== input.ownerKey ||
        lease.buildProjectId !== input.buildProjectId ||
        !Number.isSafeInteger(input.sourceVersion) || input.sourceVersion < 1 ||
        lease.sourceVersion !== input.sourceVersion ||
        lease.basePath.startsWith("/quarantined/") ||
        this.closing.has(input.previewId) || this.updates.has(input.previewId))
      throw new Error("Preview not found.");
    return lease;
  }

  /** Checks a development lease after each awaited admission/liveness step.
   * A close intent always wins over a pending or in-flight update. */
  assertDevelopmentUpdateOpen(id: string, expectedVersion: number,
    expectedFingerprint: string): FullStackPreviewLease {
    const lease = this.live.get(id);
    if (!lease || lease.mode !== "development" ||
        lease.basePath.startsWith("/quarantined/") ||
        this.closing.has(id) || !this.activeUpdates.has(id))
      throw new Error("Preview not found.");
    if (lease.sourceVersion !== expectedVersion ||
        lease.identity.fingerprint !== expectedFingerprint)
      throw new Error("Preview source is stale.");
    return lease;
  }

  /** Serialized per-lease transaction. New callers queue before their first
   * await; updates on unrelated projects may proceed independently. */
  async withDevelopmentUpdate<T>(id: string,
    operation: (lease: FullStackPreviewLease) => Promise<T>): Promise<T> {
    const predecessor = this.updates.get(id) ?? Promise.resolve();
    let release!: () => void;
    const slot = new Promise<void>(resolve => { release = resolve; });
    this.updates.set(id, slot);
    try {
      await predecessor;
      const lease = this.live.get(id);
      if (!lease || lease.mode !== "development" ||
          lease.basePath.startsWith("/quarantined/") || this.closing.has(id))
        throw new Error("Preview not found.");
      this.activeUpdates.add(id);
      return await operation(lease);
    } finally {
      this.activeUpdates.delete(id);
      release();
      if (this.updates.get(id) === slot) this.updates.delete(id);
    }
  }

  /** Commit only after the authorized workspace write has succeeded. */
  commitDevelopmentUpdate(id: string, input: Readonly<{
    expectedVersion: number;
    expectedFingerprint: string;
    nextVersion: number;
    nextIdentity: TanstackPreviewIdentity;
  }>): FullStackPreviewLease {
    const lease = this.assertDevelopmentUpdateOpen(id,
      input.expectedVersion, input.expectedFingerprint);
    if (!Number.isSafeInteger(input.nextVersion) ||
        input.nextVersion !== input.expectedVersion + 1 ||
        !input.nextIdentity?.fingerprint || !input.nextIdentity.sourceFingerprint ||
        input.nextIdentity.runtimeImageId !== lease.identity.runtimeImageId ||
        input.nextIdentity.dependencyFingerprint !== lease.identity.dependencyFingerprint ||
        input.nextIdentity.fingerprint === lease.identity.fingerprint)
      throw new Error("Invalid development preview identity.");
    const updated: FullStackPreviewLease = {...lease,
      sourceVersion: input.nextVersion, identity: input.nextIdentity,
      lastActivityAt: Date.now()};
    this.live.set(id, updated);
    return updated;
  }

  /** A failed or interrupted workspace write must never remain publicly
   * routable. Keep capacity reserved until Docker cleanup is confirmed. */
  quarantineDevelopmentUpdate(id: string): void {
    const lease = this.live.get(id);
    if (!lease || lease.mode !== "development" || !this.activeUpdates.has(id))
      throw new Error("Preview not found.");
    this.live.set(id, {...lease, basePath:`/quarantined/${id}/`});
  }

  /** Reattach only an exact, live, previously authorized mutable lease.
   * This never promotes an immutable preview or changes the source revision.
   * Caller MUST check current DB source authority before AND after this gate,
   * plus the private source/workspace records before releasing its identity.
   * No Docker allocation, capacity reservation, or source write happens here.
   */
  async claimDevelopmentReusable(input: Readonly<{
    ownerKey: string;
    buildProjectId: string;
    sourceVersion: number;
    identity: TanstackPreviewIdentity;
    maxLifetimeMs: number;
    healthCheck: (lease: FullStackPreviewLease) => Promise<boolean>;
  }>): Promise<FullStackPreviewLease | null> {
    const eligible = (candidate: FullStackPreviewLease): boolean =>
      candidate.mode === "development" &&
      candidate.ownerKey === input.ownerKey &&
      candidate.buildProjectId === input.buildProjectId &&
      candidate.sourceVersion === input.sourceVersion &&
      candidate.identity.fingerprint === input.identity.fingerprint &&
      candidate.identity.sourceFingerprint === input.identity.sourceFingerprint &&
      candidate.identity.dependencyFingerprint === input.identity.dependencyFingerprint &&
      candidate.identity.runtimeImageId === input.identity.runtimeImageId &&
      Number.isFinite(input.maxLifetimeMs) && input.maxLifetimeMs > 0 &&
      Date.now() >= candidate.createdAt &&
      Date.now() - candidate.createdAt < input.maxLifetimeMs &&
      !candidate.basePath.startsWith("/quarantined/") &&
      !this.closing.has(candidate.id) && !this.updates.has(candidate.id);
    const lease = this.list().find(eligible) ?? null;
    if (!lease) return null;
    const healthy = await this.checkLive(lease.id, input.healthCheck);
    if (!healthy) return null;
    const current = this.live.get(lease.id);
    if (!current || !eligible(current)) return null;
    previewObservability.recordLeaseReuse();
    return current;
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
    // Existing versioned-preview reuse MUST NOT claim a future mutable
    // development lease even if every source/dependency hash matches.
    const lease = this.list().find(candidate =>
      candidate.mode === "immutable" &&
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
    if (this.closing.size || this.healthChecks.size || this.updates.size || this.startingProjects.size)
      throw new Error("Cannot reset active preview cleanup.");
    this.live.clear();
  }
}
export const sharedFullStackPreviews = new SharedFullStackPreviewRegistry();
