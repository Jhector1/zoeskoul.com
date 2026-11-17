import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
import { PROJECT_DEPENDENCY_APPROVAL_PATH } from "@zoeskoul/build-preparation";
import { env } from "../../lib/env.js";
import { SharedFullStackPreviewRegistry, sharedFullStackPreviews } from "./sharedPreviewRegistry.js";
import { createTanstackPreviewIdentity } from "./tanstackPreviewIdentity.js";
import { TrustedTanstackDevelopmentSourceStore,
  trustedTanstackDevelopmentSources } from "./tanstackDevelopmentSourceStore.js";
import { startAdmittedTanstackDevelopmentPreview, startAdmittedTanstackPreview } from "./tanstackPreviewSharedLifecycle.js";

const IMAGE = `sha256:${"d".repeat(64)}`;
function request(sourceVersion = 7): ProductionBuildJobRequestV1 {
  return {
    protocolVersion: 1, operation: "production-build", buildProjectId: "project",
    sourceVersion, stackId: "tanstack-start-v1", templateId: "tanstack-start-v1",
    files: [
      {path: "package.json", content: "{}"},
      {path: "pnpm-lock.yaml", content: "lockfileVersion: '9.0'"},
      {path: PROJECT_DEPENDENCY_APPROVAL_PATH, content: "signed-approval-fixture"},
      {path: "src/routes/index.tsx", content: `export default function Index(){return <h1>v${sourceVersion}</h1>}`},
    ],
  };
}
function fixture(mode: "development" | "immutable" = "development") {
  const registry = new SharedFullStackPreviewRegistry();
  const store = new TrustedTanstackDevelopmentSourceStore(registry);
  const id = `preview_${randomUUID()}`;
  const source = request();
  const identity = createTanstackPreviewIdentity(source,IMAGE);
  const containerId = "f".repeat(64);
  registry.register({
    id, mode, ownerKey: "actor", buildProjectId: "project", sourceVersion: 7,
    identity, containerId, basePath: "/content/owned/", createdAt: Date.now(),
    lastActivityAt: Date.now(), close: async()=>undefined,
  });
  const lease = registry.get(id)!;
  const record = {previewId:id, ownerKey:"actor",buildProjectId:"project",containerId,source};
  return {registry,store,id,lease,source,record,identity,containerId};
}

afterEach(async()=>{
  for (const lease of sharedFullStackPreviews.list())
    await sharedFullStackPreviews.close(lease.id);
  sharedFullStackPreviews.resetForTests();
});

describe("private canonical development source snapshots",()=>{
  it("recovers an immutable copy of the exact signed-start source",()=>{
    const f=fixture();
    f.store.registerFromAdmittedStart(f.record);
    const recovered=f.store.resolve(f.lease);
    expect(recovered).toEqual(f.source);
    expect(recovered).not.toBe(f.source);
    expect(Object.isFrozen(recovered)).toBe(true);
    expect(Object.isFrozen(recovered!.files)).toBe(true);
    expect(Object.isFrozen(recovered!.files[0])).toBe(true);
    (f.source.files as {path:string;content:string}[])[0].content="tampered";
    expect(f.store.resolve(f.lease)!.files[0].content).toBe("{}");
  });
  it("rejects forged lease objects, immutable leases, wrong actor and source identity",()=>{
    const f=fixture();
    f.store.registerFromAdmittedStart(f.record);
    expect(f.store.resolve({...f.lease})).toBeNull();
    expect(f.store.resolve({...f.lease, ownerKey:"attacker"})).toBeNull();
    expect(f.store.resolve({...f.lease, sourceVersion:8})).toBeNull();
    expect(f.store.resolve({...f.lease, identity:{...f.identity,fingerprint:"forged"}})).toBeNull();
    const immutable=fixture("immutable");
    immutable.store.registerFromAdmittedStart(immutable.record);
    expect(immutable.store.resolve(immutable.lease)).toBeNull();
  });
  it("refuses duplicate registration, invalid source version, wrong project and false container revocation",()=>{
    const f=fixture();
    f.store.registerFromAdmittedStart(f.record);
    expect(()=>f.store.registerFromAdmittedStart(f.record)).toThrow("Invalid trusted");
    expect(()=>f.store.registerFromAdmittedStart({...f.record,previewId:"preview_forged"})).toThrow("Invalid trusted");
    expect(()=>f.store.registerFromAdmittedStart({...f.record,buildProjectId:"other"})).toThrow("Invalid trusted");
    expect(()=>f.store.registerFromAdmittedStart({...f.record,source:request(0)})).toThrow("Invalid trusted");
    f.store.revoke(f.id,"wrong");
    expect(f.store.resolve(f.lease)).not.toBeNull();
    f.store.revoke(f.id,f.containerId);
    expect(f.store.resolve(f.lease)).toBeNull();
  });
  it("refuses future version and never advances before an actual registry CAS",()=>{
    const f=fixture();
    f.store.registerFromAdmittedStart(f.record);
    expect(()=>f.store.advanceAfterCommittedLease(f.lease,request(8))).toThrow("committed source identity mismatch");
    expect(f.store.resolve(f.lease)!.sourceVersion).toBe(7);
  });
  it("advances only with the exact committed identity and rejects stale source",async()=>{
    const f=fixture();
    f.store.registerFromAdmittedStart(f.record);
    const next=request(8);
    const nextIdentity=createTanstackPreviewIdentity(next,IMAGE);
    await f.registry.withDevelopmentUpdate(f.id,async()=>{
      f.registry.commitDevelopmentUpdate(f.id,{
        expectedVersion:7,expectedFingerprint:f.identity.fingerprint,
        nextVersion:8,nextIdentity,
      });
      const committed=f.registry.get(f.id)!;
      expect(f.store.resolve(committed)).toBeNull();
      expect(()=>f.store.advanceAfterCommittedLease(committed,request(9)))
        .toThrow("committed source identity mismatch");
      f.store.advanceAfterCommittedLease(committed,next);
      expect(f.store.resolve(committed)).toEqual(next);
      expect(()=>f.store.advanceAfterCommittedLease(committed,next))
        .toThrow("committed source identity mismatch");
    });
  });
  it("driver-owned development start stores source and verified shutdown revokes it",async()=>{
    const source=request();
    const identity=createTanstackPreviewIdentity(source,IMAGE);
    const workspaceDir=`${env.workspaceRoot}/zoeskoul-run-${randomUUID()}`;
    const cleanup=vi.fn(async()=>undefined);
    const driver={prepare:async()=>workspaceDir,launch:async()=>"a".repeat(64),
      probe:async()=>({status:200,headers:{"content-type":"text/html"},
        bodyBase64:Buffer.from("<html><head></head><body>ready</body></html>").toString("base64")}),
      destroy:vi.fn(async()=>undefined),cleanup,
      now:()=>1,sleep:async()=>undefined};
    const started=await startAdmittedTanstackDevelopmentPreview({
      ownerKey:"actor",request:source,identity,authorize:async()=>undefined,
      driverFactory:()=>driver,
    });
    const lease=sharedFullStackPreviews.get(started.previewId)!;
    expect(trustedTanstackDevelopmentSources.resolve(lease)).toEqual(source);
    await sharedFullStackPreviews.close(started.previewId);
    expect(trustedTanstackDevelopmentSources.resolve(lease)).toBeNull();
    expect(cleanup).toHaveBeenCalledOnce();
  });
  it("immutable start never exposes canonical development source",async()=>{
    const source=request();
    const identity=createTanstackPreviewIdentity(source,IMAGE);
    const workspaceDir=`${env.workspaceRoot}/zoeskoul-run-${randomUUID()}`;
    const driver={prepare:async()=>workspaceDir,launch:async()=>"a".repeat(64),
      probe:async()=>({status:200,headers:{"content-type":"text/html"},
        bodyBase64:Buffer.from("<html><head></head><body>ready</body></html>").toString("base64")}),
      destroy:vi.fn(async()=>undefined),cleanup:vi.fn(async()=>undefined),
      now:()=>1,sleep:async()=>undefined};
    const started=await startAdmittedTanstackPreview({
      ownerKey:"actor",request:source,identity,authorize:async()=>undefined,
      driverFactory:()=>driver,
    });
    expect(trustedTanstackDevelopmentSources.resolve(sharedFullStackPreviews.get(started.previewId)!))
      .toBeNull();
  });
});
