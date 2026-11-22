import { describe, expect, it } from "vitest";
import {
  ManagedBinaryRevisionError,
  planNextManagedBinaryRevision,
  readVerifiedManagedBinary,
  validateManagedBinaryPath,
  validateManagedBinaryRevision,
  validateServerVerifiedBinaryAsset,
  type ManagedBinaryRevision,
  type ServerVerifiedBinaryAsset,
} from "./managedBinaryRevision";

const scope = { ownerId: "user_12345678", buildProjectId: "project_12345678" };
const bytes = new TextEncoder().encode("unique image bytes");
const sha = "f".repeat(64);
const assetId = "asset_123456789abcdeff";
const asset: ServerVerifiedBinaryAsset = {
  ...scope, assetId, objectKey: `project-media/${scope.ownerId}/${scope.buildProjectId}/${assetId}/${sha}`,
  sha256: sha, mimeType: "image/png", byteLength: bytes.length,
};
const v1: ManagedBinaryRevision = {
  ...scope, sourceVersion: 5,
  bindings: [{ ...asset, nodeId: "node_12345678", path: "public/assets/images/hero.png" }],
};
const next = (fields: Record<string, unknown> = {}) =>
  planNextManagedBinaryRevision({ scope, previous: v1, baseVersion: 5, nextVersion: 6,
    files: [{ nodeId: "node_12345678", path: "public/assets/images/hero.png", assetId }],
    newlyStored: [], ...fields });

const failure = (fn: () => unknown, code: string) => {
  expect(fn).toThrow(ManagedBinaryRevisionError);
  expect(fn).toThrow(code);
};

describe("AI4B4E1 managed binary manifest foundation", () => {
  it("accepts scoped immutable R2 metadata", () => {
    expect(validateServerVerifiedBinaryAsset(asset,scope)).toEqual(asset);
  });
  it("rejects cross-project and cross-owner catalog records", () => {
    failure(() => validateServerVerifiedBinaryAsset(asset,{...scope,ownerId:"other_12345678"}), "MANAGED_BINARY_SCOPE_MISMATCH");
    failure(() => validateServerVerifiedBinaryAsset(asset,{...scope,buildProjectId:"project_others"}), "MANAGED_BINARY_SCOPE_MISMATCH");
  });
  it("does not permit arbitrary R2 keys or invalid hashes", () => {
    failure(() => validateServerVerifiedBinaryAsset({...asset,objectKey:"public/hero.png"},scope),"MANAGED_BINARY_OBJECT_KEY_MISMATCH");
    failure(() => validateServerVerifiedBinaryAsset({...asset,sha256:"0"},scope),"MANAGED_BINARY_IDENTITY_INVALID");
  });
  it("enforces media size and current R2 MIME coverage", () => {
    failure(() => validateServerVerifiedBinaryAsset({...asset,byteLength:0},scope),"MANAGED_BINARY_METADATA_INVALID");
    failure(() => validateServerVerifiedBinaryAsset({...asset,byteLength:21*1024*1024},scope),"MANAGED_BINARY_METADATA_INVALID");
    failure(() => validateServerVerifiedBinaryAsset({...asset,mimeType:"application/pdf"},scope),"MANAGED_BINARY_METADATA_INVALID");
  });
  it("rejects traversal, credential paths, forged extension, and path case collisions", () => {
    for (const path of ["../private.png","/root.png","public//hero.png","public/../hero.png",
      "C:/hero.png",".env/hero.png","public/.git/hero.png","public/.env.secret/hero.png","public\\hero.png"]) {
      failure(() => validateManagedBinaryPath(path,"image/png"),"MANAGED_BINARY_PATH_INVALID");
    }
    failure(() => validateManagedBinaryPath("public/assets/not-image.jpg","image/png"),"MANAGED_BINARY_MIME_PATH_MISMATCH");
    failure(() => validateManagedBinaryRevision({...v1,bindings:[...v1.bindings,
      {...v1.bindings[0],nodeId:"node_87654321",path:"PUBLIC/ASSETS/IMAGES/HERO.PNG"}]},scope,5),"MANAGED_BINARY_DUPLICATE_BINDING");
  });
  it("rejects stale revisions, gaps, and synthetic version swaps", () => {
    failure(() => next({baseVersion:4}),"MANAGED_BINARY_REVISION_SEQUENCE_INVALID");
    failure(() => next({nextVersion:8}),"MANAGED_BINARY_REVISION_SEQUENCE_INVALID");
    failure(() => validateManagedBinaryRevision(v1,scope,6),"MANAGED_BINARY_REVISION_MISMATCH");
  });
  it("retains an object unchanged on rename or move, preserving old revision", () => {
    const v2=next({files:[{nodeId:"node_12345678",path:"public/images/new-name.png",assetId}]});
    expect(v2.bindings[0].objectKey).toBe(v1.bindings[0].objectKey);
    expect(v2.bindings[0].path).toBe("public/images/new-name.png");
    expect(v1.bindings[0].path).toBe("public/assets/images/hero.png");
  });
  it("makes deletion a new-revision binding removal without touching the old revision", () => {
    expect(next({files:[]}).bindings).toEqual([]);
    expect(v1.bindings).toHaveLength(1);
  });
  it("does not permit an arbitrary newly referenced assetId", () => {
    failure(() => next({files:[{nodeId:"node_12345678",path:"public/a.png",assetId:"asset_untrusted"}]}),"MANAGED_BINARY_ASSET_NOT_VERIFIED");
  });
  it("supports replacement only with catalog-verified newly uploaded asset", () => {
    const replacementId="asset_abcdef9876543210";
    const replacement={...asset,assetId:replacementId,
      objectKey:`project-media/${scope.ownerId}/${scope.buildProjectId}/${replacementId}/${sha}`};
    const result=next({newlyStored:[replacement],files:[{nodeId:"node_12345678",path:"public/a.png",assetId:replacementId}]});
    expect(result.bindings[0].assetId).toBe(replacementId);
    expect(v1.bindings[0].assetId).toBe(assetId);
  });
  it("refuses unused staged asset records and duplicate staged IDs", () => {
    failure(() => next({newlyStored:[asset],files:[]}),"MANAGED_BINARY_UNUSED_STAGED_ASSET");
    failure(() => next({newlyStored:[asset,asset]}),"MANAGED_BINARY_STAGED_DUPLICATE");
  });
  it("guards duplicate node IDs even across distinct paths", () => {
    failure(() => next({files:[
      {nodeId:"node_12345678",path:"public/a.png",assetId},
      {nodeId:"node_12345678",path:"public/b.png",assetId},
    ]}),"MANAGED_BINARY_DUPLICATE_BINDING");
  });
  it("refuses a cross-owner revision read before accessing R2", async () => {
    let reads=0;
    await expect(readVerifiedManagedBinary({scope:{...scope,ownerId:"other_12345678"},revision:v1,
      sourceVersion:5,nodeId:"node_12345678",readObject:async()=>{reads++;return bytes;}}))
      .rejects.toThrow("MANAGED_BINARY_REVISION_MISMATCH");
    expect(reads).toBe(0);
  });
  it("rejects missing and tampered objects; verifies byte hash before returning",async () => {
    const goodSha = await crypto.subtle.digest("SHA-256",bytes);
    const digest = Array.from(new Uint8Array(goodSha),b=>b.toString(16).padStart(2,"0")).join("");
    const correct={...v1,bindings:[{...asset,sha256:digest,objectKey:
      `project-media/${scope.ownerId}/${scope.buildProjectId}/${assetId}/${digest}`,
      nodeId:"node_12345678",path:"public/assets/images/hero.png"}]};
    await expect(readVerifiedManagedBinary({scope,revision:correct,sourceVersion:5,nodeId:"node_12345678",
      readObject:async()=>null})).rejects.toThrow("MANAGED_BINARY_OBJECT_INTEGRITY_FAILURE");
    await expect(readVerifiedManagedBinary({scope,revision:correct,sourceVersion:5,nodeId:"node_12345678",
      readObject:async()=>new TextEncoder().encode("UNIQUE image bytes")})).rejects.toThrow("MANAGED_BINARY_OBJECT_INTEGRITY_FAILURE");
    const read=await readVerifiedManagedBinary({scope,revision:correct,sourceVersion:5,nodeId:"node_12345678",
      readObject:async()=>bytes});
    expect(read).toEqual(bytes);
    expect(read).not.toBe(bytes);
  });
});
