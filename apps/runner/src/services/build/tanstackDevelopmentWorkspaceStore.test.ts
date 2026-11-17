import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { SharedFullStackPreviewRegistry } from "./sharedPreviewRegistry.js";
import { TrustedTanstackDevelopmentWorkspaceStore } from "./tanstackDevelopmentWorkspaceStore.js";

const IMAGE = `sha256:${"c".repeat(64)}`;
function fixture(mode: "development" | "immutable" = "development") {
  const registry = new SharedFullStackPreviewRegistry();
  const store = new TrustedTanstackDevelopmentWorkspaceStore(registry);
  const id = `preview_${randomUUID()}`;
  const dir = `/private/runner/zoeskoul-run-${randomUUID()}`;
  const containerId = "a".repeat(64);
  const identity = { sourceFingerprint: "source-7", dependencyFingerprint: "deps",
    runtimeImageId: IMAGE, fingerprint: "fp-7" };
  const close = vi.fn(async () => undefined);
  registry.register({ id, mode, ownerKey: "actor", buildProjectId: "project",
    sourceVersion: 7, identity, containerId, basePath: "/content/token/",
    createdAt: Date.now(), lastActivityAt: Date.now(), close });
  const record = { previewId:id, ownerKey:"actor", buildProjectId:"project",
    containerId, workspaceRoot:"/private/runner", workspaceDir:dir };
  return { registry, store, id, record, close, identity };
}

describe("trusted development workspace handles", () => {
  it("derives the current version and identity from a live development lease", () => {
    const f = fixture();
    f.store.registerFromDriver(f.record);
    const lease = f.registry.get(f.id)!;
    expect(f.store.resolve(lease)).toMatchObject({
      ...f.record, sourceVersion:7, identityFingerprint:"fp-7",
    });
    expect(f.store.resolve({...lease,sourceVersion:6})).toBeNull();
  });
  it("never resolves immutable, unknown, or quarantined leases", () => {
    const f = fixture("immutable");
    f.store.registerFromDriver(f.record);
    expect(f.store.resolve(f.registry.get(f.id)!)).toBeNull();
    const g = fixture();
    expect(g.store.resolve(g.registry.get(g.id)!)).toBeNull();
    g.store.registerFromDriver(g.record);
    const original = g.registry.get(g.id)!;
    expect(g.store.resolve({...original,basePath:`/quarantined/${g.id}/`})).toBeNull();
  });
  it("refuses a wrong container, altered project or forged record", () => {
    const f = fixture();
    f.store.registerFromDriver(f.record);
    const lease = f.registry.get(f.id)!;
    expect(f.store.resolve({...lease,containerId:"wrong"})).toBeNull();
    expect(f.store.resolve({...lease,buildProjectId:"other"})).toBeNull();
    expect(()=>f.store.registerFromDriver(f.record)).toThrow("Invalid trusted");
    f.store.revoke(f.id,"wrong");
    expect(f.store.resolve(lease)).not.toBeNull();
    f.store.revoke(f.id,f.record.containerId);
    expect(f.store.resolve(lease)).toBeNull();
  });
  it("rejects traversal, nested roots, non-run identifiers and client-controlled shapes", () => {
    const f = fixture();
    for (const changed of [
      {workspaceDir:"/outside/zoeskoul-run-"+randomUUID()},
      {workspaceDir:`${f.record.workspaceRoot}/some/zoeskoul-run-${randomUUID()}`},
      {workspaceDir:`${f.record.workspaceRoot}/not-a-run`},
      {workspaceDir:`${f.record.workspaceRoot}/zoeskoul-run-${randomUUID()}/..`},
      {workspaceRoot:"relative/path"}, {previewId:"preview_client"},
    ]) expect(() => f.store.registerFromDriver({...f.record,...changed})).toThrow("Invalid trusted");
  });
  it("follows successive registry commits without a writable handle rebind API", async () => {
    const f = fixture();
    f.store.registerFromDriver(f.record);
    await f.registry.withDevelopmentUpdate(f.id, async lease => {
      f.registry.commitDevelopmentUpdate(f.id, { expectedVersion:7,
        expectedFingerprint: "fp-7", nextVersion:8,
        nextIdentity:{...f.identity,sourceFingerprint:"source-8",fingerprint:"fp-8"} });
      expect(f.store.resolve(lease)).toBeNull();
      expect(f.store.resolve(f.registry.get(f.id)!)).toMatchObject({
        sourceVersion:8,identityFingerprint:"fp-8",
      });
    });
  });
});
