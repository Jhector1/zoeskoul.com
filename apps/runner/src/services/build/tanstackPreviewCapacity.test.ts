import { afterEach, describe, expect, it } from "vitest";
import { sharedFullStackPreviews } from "./sharedPreviewRegistry.js";
import { reclaimTanstackPreviewCapacity, reserveTanstackPreviewCapacity } from "./tanstackPreviewCapacity.js";

const identity={sourceFingerprint:"source",dependencyFingerprint:"dependencies",
  runtimeImageId:`sha256:${"a".repeat(64)}`,fingerprint:"identity"} as const;

let number = 0;
function addLease(ownerKey: string, buildProjectId: string, ageMs: number,
                  close: () => Promise<void> = async () => {}) {
  const now = Date.now();
  const id = `p3b7d6_${++number}`;
  sharedFullStackPreviews.register({
    id, ownerKey, buildProjectId, sourceVersion: 1, identity,
    containerId: `sandbox_${id}`, basePath: `/content/${id}/`,
    createdAt: now - ageMs, lastActivityAt: now - ageMs,
    close,
  });
  return id;
}
afterEach(async () => {
  for (const lease of sharedFullStackPreviews.list()) await sharedFullStackPreviews.close(lease.id);
  sharedFullStackPreviews.resetForTests();
});

describe("P3B7D6 TanStack-only preview capacity", () => {
  it("holds the single preview slot during startup and releases it once", () => {
    const release = reserveTanstackPreviewCapacity("owner-d6-one");
    try {
      expect(() => reserveTanstackPreviewCapacity("owner-d6-two")).toThrow(/Runner is busy/);
    } finally { release(); release(); }
    const other = reserveTanstackPreviewCapacity("owner-d6-three");
    other();
  });

  it("does not evict a different owner's recent sandbox", async () => {
    addLease("owner-d6-protected", "project-a", 2_000);
    await reclaimTanstackPreviewCapacity("owner-d6-requester", "project-b");
    expect(sharedFullStackPreviews.count()).toBe(1);
    expect(() => reserveTanstackPreviewCapacity("owner-d6-requester")).toThrow(/Runner is busy/);
  });

  it("reclaims the same owner's other project before admitting a new start", async () => {
    let closed = 0;
    addLease("owner-d6-navigation", "old-project", 1_000, async () => {closed++;});
    await reclaimTanstackPreviewCapacity("owner-d6-navigation", "new-project");
    expect(closed).toBe(1);
    expect(sharedFullStackPreviews.count()).toBe(0);
    const release = reserveTanstackPreviewCapacity("owner-d6-navigation");
    release();
  });

  it("reclaims an idle foreign preview only after the idle threshold", async () => {
    let closed = 0;
    addLease("owner-d6-idle", "stale-project", 46_000, async () => {closed++;});
    await reclaimTanstackPreviewCapacity("owner-d6-fresh", "new-project");
    expect(closed).toBe(1);
    const release = reserveTanstackPreviewCapacity("owner-d6-fresh");
    release();
  });

  it("fails closed when Docker teardown is unverified and retains capacity", async () => {
    let fail = true;
    const id = addLease("owner-d6-failed", "old-project", 55_000, async () => {
      if (fail) throw new Error("sandbox teardown incomplete");
    });
    try {
      await expect(reclaimTanstackPreviewCapacity("owner-d6-new", "new-project"))
        .rejects.toThrow("sandbox teardown incomplete");
      expect(sharedFullStackPreviews.get(id)).not.toBeNull();
      expect(() => reserveTanstackPreviewCapacity("owner-d6-new"))
        .toThrow(/Runner is busy/);
    } finally { fail = false; }
  });

  it("does not reclaim the matching project while a lease is active", async () => {
    const id = addLease("owner-d6-current", "same-project", 3_000);
    await reclaimTanstackPreviewCapacity("owner-d6-current", "same-project");
    expect(sharedFullStackPreviews.get(id)).not.toBeNull();
    expect(() => reserveTanstackPreviewCapacity("owner-d6-current")).toThrow(/Runner is busy/);
  });
});
