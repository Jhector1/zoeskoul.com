import { describe, it, expect } from "vitest";
import {
  authorizeBuildMediaOwner, assertBuildMediaImageSignature,
  ingestPrivateBuildMediaImage, readPrivateBuildMediaImage,
  type BuildMediaMetadataRepository, type BuildMediaPrivateObjectStore,
} from "./projectMediaStorage";
import type { BuildMediaAsset } from "@zoeskoul/build-contracts";

const scope = { ownerId: "user_12345678", buildProjectId: "cm3project12345678" };
const assetId = "asset_123456789";
const png = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1]);
function harness() {
  const objects = new Map<string, Uint8Array>();
  const rows = new Map<string, BuildMediaAsset>();
  let puts = 0;
  const store: BuildMediaPrivateObjectStore = {
    async putIfAbsent({key,bytes}) { puts++; if (objects.has(key)) return "already-exists"; objects.set(key,Uint8Array.from(bytes));return "created"; },
    async read(key) { return objects.get(key) ?? null; },
  };
  const catalog: BuildMediaMetadataRepository = {
    async find(s,id) { expect(s).toEqual(scope); return rows.get(id) ?? null; },
    async insertIfAbsent(asset) { const found = rows.get(asset.id); if (found) return found; rows.set(asset.id,asset);return asset; },
  };
  const inspector = { async inspect(_bytes: Uint8Array) { return {mimeType:"image/png",width:1,height:1}; } };
  const access = {actorUserId:scope.ownerId,buildProjectId:scope.buildProjectId,ownership:{getActiveProjectOwnerId:async()=>scope.ownerId}};
  const input = {...access,assetId,origin:"generated" as const,providerId:"sample-provider",modelId:"image/model",bytes:png,altText:"A chessboard",store,catalog,inspector};
  return { objects,rows,input,access,store,catalog,inspector, get puts(){return puts;} };
}

describe("AI4B1 authenticated immutable private media service",()=>{
  it("authorizes only active owner using database-derived ownership",async()=>{
    const ownership={getActiveProjectOwnerId:async()=>scope.ownerId};
    await expect(authorizeBuildMediaOwner({actorUserId:scope.ownerId,buildProjectId:scope.buildProjectId,ownership})).resolves.toEqual(scope);
    await expect(authorizeBuildMediaOwner({actorUserId:"another_user",buildProjectId:scope.buildProjectId,ownership})).rejects.toThrow("BUILD_MEDIA_ACCESS_DENIED");
  });
  it("gives identical access errors for missing and archived projects",async()=>{
    const ownership={getActiveProjectOwnerId:async()=>null};
    await expect(authorizeBuildMediaOwner({actorUserId:scope.ownerId,buildProjectId:scope.buildProjectId,ownership})).rejects.toThrow("BUILD_MEDIA_ACCESS_DENIED");
  });
  it("rejects invalid credentials and forged project identifiers",async()=>{
    const ownership={getActiveProjectOwnerId:async()=>scope.ownerId};
    await expect(authorizeBuildMediaOwner({actorUserId:"../../root",buildProjectId:scope.buildProjectId,ownership})).rejects.toThrow("BUILD_MEDIA_ACCESS_DENIED");
  });
  it("checks image signatures and rejects script masquerading as PNG",()=>{
    expect(()=>assertBuildMediaImageSignature(png,"image/png")).not.toThrow();
    expect(()=>assertBuildMediaImageSignature(new TextEncoder().encode("<svg onload=alert(1)>"),"image/png")).toThrow("BUILD_MEDIA_SIGNATURE_INVALID");
  });
  it("rejects mismatched image MIME",()=>{
    expect(()=>assertBuildMediaImageSignature(png,"image/jpeg")).toThrow("BUILD_MEDIA_SIGNATURE_INVALID");
  });
  it("stores private digest-keyed asset with trusted image metadata",async()=>{
    const h=harness(); const asset=await ingestPrivateBuildMediaImage(h.input);
    expect(asset.visibility).toBe("private");
    expect(asset.objectKey).toMatch(/^project-media\/user_12345678\/cm3project12345678\/asset_123456789\/[a-f0-9]{64}$/);
    expect(asset.byteLength).toBe(png.length);
    expect(asset.width).toBe(1);
    expect(h.puts).toBe(1);
  });
  it("returns committed asset for identical retry without rewriting object",async()=>{
    const h=harness(); const a=await ingestPrivateBuildMediaImage(h.input);
    const b=await ingestPrivateBuildMediaImage(h.input);
    expect(a).toEqual(b);expect(h.puts).toBe(1);
  });
  it("does not confirm an idempotent retry when stored bytes are missing",async()=>{
    const h=harness();const asset=await ingestPrivateBuildMediaImage(h.input);
    h.objects.delete(asset.objectKey);
    await expect(ingestPrivateBuildMediaImage(h.input)).rejects.toThrow("BUILD_MEDIA_OBJECT_INTEGRITY_FAILURE");
  });
  it("rejects conflicting asset ID and preserves original",async()=>{
    const h=harness();await ingestPrivateBuildMediaImage(h.input);
    const changed=Uint8Array.from([...png,33]);
    await expect(ingestPrivateBuildMediaImage({...h.input,bytes:changed})).rejects.toThrow("BUILD_MEDIA_IMMUTABLE_CONFLICT");
    expect(h.puts).toBe(1);
  });
  it("rejects unverified provider provenance",async()=>{
    const h=harness();await expect(ingestPrivateBuildMediaImage({...h.input,providerId:null})).rejects.toThrow();
  });
  it("supports authenticated uploaded image provenance",async()=>{
    const h=harness();const asset=await ingestPrivateBuildMediaImage({...h.input,origin:"uploaded",providerId:null,modelId:null});
    expect(asset.origin).toBe("uploaded");
  });
  it("refuses cross-project catalog rows",async()=>{
    const h=harness();const a=await ingestPrivateBuildMediaImage(h.input);
    h.rows.set(assetId,{...a,scope:{...scope,ownerId:"another_user"}});
    await expect(readPrivateBuildMediaImage({...h.access,assetId,store:h.store,catalog:h.catalog})).rejects.toThrow("BUILD_MEDIA_SCOPE_MISMATCH");
  });
  it("reads only matching private asset and verifies content digest",async()=>{
    const h=harness();const a=await ingestPrivateBuildMediaImage(h.input);
    const read=await readPrivateBuildMediaImage({...h.access,assetId,store:h.store,catalog:h.catalog});
    expect(read?.asset).toEqual(a);expect(read?.bytes).toEqual(png);
  });
  it("rejects tampered object bytes",async()=>{
    const h=harness();const a=await ingestPrivateBuildMediaImage(h.input);
    h.objects.set(a.objectKey,Uint8Array.from([...png.slice(0,-1),42]));
    await expect(readPrivateBuildMediaImage({...h.access,assetId,store:h.store,catalog:h.catalog})).rejects.toThrow("BUILD_MEDIA_OBJECT_INTEGRITY_FAILURE");
  });
  it("rejects storage object collision despite matching key",async()=>{
    const h=harness();h.objects.set("some",png);
    const store:BuildMediaPrivateObjectStore={async putIfAbsent(){return "already-exists";},async read(){return new Uint8Array([1,2]);}};
    await expect(ingestPrivateBuildMediaImage({...h.input,store})).rejects.toThrow("BUILD_MEDIA_OBJECT_COLLISION");
  });
  it("rejects oversized object before object-store invocation",async()=>{
    const h=harness();await expect(ingestPrivateBuildMediaImage({...h.input,bytes:new Uint8Array(20*1024*1024+1)})).rejects.toThrow("BUILD_MEDIA_SIZE_INVALID");
    expect(h.puts).toBe(0);
  });
  it("rejects unverified decoded metadata",async()=>{
    const h=harness();await expect(ingestPrivateBuildMediaImage({...h.input,inspector:{async inspect(){return {mimeType:"image/png",width:0,height:1};}}})).rejects.toThrow();
  });
  it("returns missing media as null, not an arbitrary storage object",async()=>{
    const h=harness();await expect(readPrivateBuildMediaImage({...h.access,assetId,store:h.store,catalog:h.catalog})).resolves.toBe(null);
  });
});
