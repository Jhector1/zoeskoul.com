import { afterEach, describe, expect, it } from "vitest";
import { sharedFullStackPreviews } from "./sharedPreviewRegistry.js";
import { sharedPreviewProjectDrains } from "./sharedPreviewRuntimeState.js";
import {
  drainTanstackProjectPreviews,
  releaseTanstackProjectPreviewDrain,
} from "./tanstackPreviewProjectDrain.js";

const owner = "owner-a";
const project = "project-123";
const identity={sourceFingerprint:"source",dependencyFingerprint:"dependencies",
  runtimeImageId:`sha256:${"a".repeat(64)}`,fingerprint:"identity"} as const;
function register(id: string, ownerKey: string, buildProjectId: string, close: () => Promise<void>) {
  const now = Date.now();
  sharedFullStackPreviews.register({
    id, ownerKey, buildProjectId, sourceVersion: 1, identity,
    containerId: `container-${id}`, basePath: `/content/${id}/`,
    createdAt: now, lastActivityAt: now, close,
  });
}
afterEach(async () => {
  for (const lease of sharedFullStackPreviews.list()) await sharedFullStackPreviews.close(lease.id);
  sharedFullStackPreviews.resetForTests();
  sharedPreviewProjectDrains.reset();
});

describe("P3B7D5 canonical TanStack project drain", () => {
  it("drains only the matching owner and project, and requires an exact release token", async () => {
    const closed: string[] = [];
    register("matching", owner, project, async () => { closed.push("matching"); });
    register("other-owner", "owner-b", project, async () => { closed.push("other-owner"); });
    register("other-project", owner, "project-xyz", async () => { closed.push("other-project"); });
    const result = await drainTanstackProjectPreviews({ ownerKey: owner, buildProjectId: project });
    expect(result.ok).toBe(true);
    expect(result.stoppedCount).toBe(1);
    expect(closed).toEqual(["matching"]);
    expect(sharedFullStackPreviews.get("matching")).toBeNull();
    expect(sharedFullStackPreviews.count()).toBe(2);
    expect(() => sharedPreviewProjectDrains.beginStart(owner, project)).toThrow("in progress");
    expect(releaseTanstackProjectPreviewDrain({ownerKey:"owner-b",buildProjectId:project,drainId:result.drainId})).toBe(false);
    expect(releaseTanstackProjectPreviewDrain({ownerKey:owner,buildProjectId:project,drainId:"drain_00000000-0000-0000-0000-000000000000"})).toBe(false);
    expect(releaseTanstackProjectPreviewDrain({ownerKey:owner,buildProjectId:project,drainId:result.drainId})).toBe(true);
    const finish = sharedPreviewProjectDrains.beginStart(owner, project);
    finish();
  });

  it("refuses draining while that project has an in-flight startup", async () => {
    const finish = sharedPreviewProjectDrains.beginStart(owner, project);
    await expect(drainTanstackProjectPreviews({ownerKey:owner,buildProjectId:project})).rejects.toThrow("startup in progress");
    finish();
    const result = await drainTanstackProjectPreviews({ownerKey:owner,buildProjectId:project});
    expect(result.stoppedCount).toBe(0);
    expect(releaseTanstackProjectPreviewDrain({ownerKey:owner,buildProjectId:project,drainId:result.drainId})).toBe(true);
  });

  it("holds the project barrier and capacity lease when cleanup fails", async () => {
    let failing = true;
    register("failed", owner, project, async () => {
      if (failing) throw new Error("sandbox teardown incomplete");
    });
    await expect(drainTanstackProjectPreviews({ownerKey:owner,buildProjectId:project}))
      .rejects.toThrow("sandbox teardown incomplete");
    expect(sharedFullStackPreviews.get("failed")).not.toBeNull();
    expect(() => sharedPreviewProjectDrains.beginStart(owner, project)).toThrow("in progress");
    // The test cleanup only repairs its simulated failure. The production
    // registry retains a failed lease until a real verified cleanup succeeds.
    failing = false;
  });

  it("isolates a drained project from another actor's live preview", async () => {
    register("other", "owner-b", project, async () => {});
    const result = await drainTanstackProjectPreviews({ownerKey:owner,buildProjectId:project});
    expect(result.stoppedCount).toBe(0);
    expect(sharedFullStackPreviews.get("other")).not.toBeNull();
    const finishOther = sharedPreviewProjectDrains.beginStart("owner-b", project);
    finishOther();
    expect(releaseTanstackProjectPreviewDrain({ownerKey:owner,buildProjectId:project,drainId:result.drainId})).toBe(true);
  });
});
