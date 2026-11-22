import {describe,it,expect,vi} from "vitest";
import {assertCommittedManagedBinaryIntents} from "./managedBinaryPrismaPolicy";
import type {ManagedBinaryBinding,ManagedBinaryScope} from "./managedBinaryRevision";
const scope:ManagedBinaryScope={ownerId:"user_01234567",buildProjectId:"project_01234567"};
const hash="b".repeat(64);
const key=`project-media/${scope.ownerId}/${scope.buildProjectId}/asset_0123456789/${hash}`;
const binding:ManagedBinaryBinding={...scope,assetId:"asset_0123456789",objectKey:key,sha256:hash,mimeType:"image/png",byteLength:24,nodeId:"file_01234567",path:"public/img.png"};
const intent={...binding,plannedBaseVersion:7,state:"uploaded"};
const check=(rows:readonly typeof intent[], files:readonly ManagedBinaryBinding[]=[binding],asked=scope)=>(
  assertCommittedManagedBinaryIntents(files,asked,7,rows)
);
describe("AI4B4E2C private R2 intent admission",()=>{
 it("accepts an uploaded intent for the exact owner, project, and base revision",()=>{
  expect(check([intent])).toEqual([binding.assetId]);
 });
 it("allows already committed, manifest-verified immutable assets without recommitting",()=>{
  expect(check([{...intent,state:"committed",plannedBaseVersion:3}])).toEqual([]);
 });
 it("supports the same project asset referenced in two paths without duplicate updates",()=>{
  expect(check([intent],[binding,{...binding,nodeId:"file_98765432",path:"public/other.png"}])).toEqual([binding.assetId]);
 });
 it("rejects missing upload intent",()=>{
  expect(()=>check([])).toThrow("MANAGED_DB_ASSET_INTENT_UNVERIFIED");
 });
 it("rejects pending R2 objects",()=>{
  expect(()=>check([{...intent,state:"pending"}])).toThrow("MANAGED_DB_ASSET_INTENT_UNVERIFIED");
 });
 it("rejects cross-owner and cross-project metadata",()=>{
  expect(()=>check([{...intent,ownerId:"other_01234567"}])).toThrow("MANAGED_DB_ASSET_INTENT_UNVERIFIED");
  expect(()=>check([{...intent,buildProjectId:"other_01234567"}])).toThrow("MANAGED_DB_ASSET_INTENT_UNVERIFIED");
 });
 it("rejects tampered object key, bytes, and hashes",()=>{
  expect(()=>check([{...intent,objectKey:key+"x"}])).toThrow("MANAGED_DB_ASSET_INTENT_UNVERIFIED");
  expect(()=>check([{...intent,sha256:"c".repeat(64)}])).toThrow("MANAGED_DB_ASSET_INTENT_UNVERIFIED");
  expect(()=>check([{...intent,byteLength:25}])).toThrow("MANAGED_DB_ASSET_INTENT_UNVERIFIED");
 });
 it("rejects stale newly uploaded objects",()=>{
  expect(()=>check([{...intent,plannedBaseVersion:6}])).toThrow("MANAGED_DB_ASSET_INTENT_STALE");
 });
 it("handles a source revision without images",()=>{
  expect(check([],[])).toEqual([]);
 });
});

import {managedBinaryWriteLane,generalManagedProjectEligible,assertManagedBinaryStorageBudget,MANAGED_BINARY_STORAGE_BUDGET} from "./managedBinaryPrismaPolicy";
describe("U20 general managed image admission",()=>{
 const flags={ZOEBUILD_MANAGED_R2_READS:"1",ZOEBUILD_MANAGED_R2_WRITES:"1",ZOEBUILD_MANAGED_R2_GENERAL_WRITES:"1"};
 it("needs all exact flags and arbitrary project identities",()=>{
   expect(managedBinaryWriteLane("project_alpha",flags)).toBe("general");
   expect(managedBinaryWriteLane("project_beta",flags)).toBe("general");
   for(const key of Object.keys(flags)) for(const value of [undefined,"0","true"]) expect(managedBinaryWriteLane("project_alpha",{...flags,[key]:value})).toBeNull();
 });
 it("never bypasses a selected pilot guard",()=>{
   expect(managedBinaryWriteLane("pilot",{...flags,ZOEBUILD_MANAGED_R2_PILOT_PROJECT_ID:"pilot"})).toBe("pilot");
 });
 it("only generalizes private canonical projects without a share token",()=>{
   const p={stackId:"tanstack-start-v1",codeProject:{visibility:"private",shareToken:null}};
   expect(generalManagedProjectEligible(p)).toBe(true);
   expect(generalManagedProjectEligible({...p,stackId:"react-vite-v1"})).toBe(false);
   expect(generalManagedProjectEligible({...p,codeProject:{visibility:"public",shareToken:null}})).toBe(false);
   expect(generalManagedProjectEligible({...p,codeProject:{visibility:"private",shareToken:"token"}})).toBe(false);
 });
 it.each(["project","owner"] as const)("bounds %s bytes and object count",key=>{
   const empty={bytes:0,objects:0}; const limit=MANAGED_BINARY_STORAGE_BUDGET[key];
   const input={project:empty,owner:empty,additionalBytes:1};
   expect(()=>assertManagedBinaryStorageBudget({...input,[key]:{bytes:limit.bytes-1,objects:limit.objects-1}})).not.toThrow();
   expect(()=>assertManagedBinaryStorageBudget({...input,[key]:{bytes:limit.bytes,objects:0}})).toThrow("MANAGED_UPLOAD_STORAGE_LIMIT");
   expect(()=>assertManagedBinaryStorageBudget({...input,[key]:{bytes:0,objects:limit.objects}})).toThrow("MANAGED_UPLOAD_STORAGE_LIMIT");
 });
 it("refuses malformed accounting",()=>{
   expect(()=>assertManagedBinaryStorageBudget({project:{bytes:NaN,objects:0},owner:{bytes:0,objects:0},additionalBytes:1})).toThrow("MANAGED_UPLOAD_BUDGET_INVALID");
 });
});

vi.mock("server-only",()=>({}));
vi.mock("@zoeskoul/db",()=>({Prisma:{TransactionIsolationLevel:{Serializable:"Serializable"}}}));
vi.mock("@zoeskoul/build-application",()=>({assertBuildMediaImageSignature:vi.fn()}));
import {createDurableManagedBinaryUploader} from "./managedBinaryUploadJournal";
describe("U20 durable reservation before private PUT",()=>{
 const bytes=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==","base64");
 function fixture(opts:{wrongOwner?:boolean;shared?:boolean;overBudget?:boolean;rejectCommit?:boolean}={}) {
   let committed=false;
   const create=vi.fn(async()=>({}));
   const aggregate=vi.fn(async()=>({_sum:{byteLength:opts.overBudget?MANAGED_BINARY_STORAGE_BUDGET.owner.bytes:0},_count:0}));
   const putIfAbsent=vi.fn(async()=>{expect(committed).toBe(true);return "created" as const;});
   const where=vi.fn(async()=>opts.wrongOwner?null:{stackId:"tanstack-start-v1",codeProject:{currentVersion:7,visibility:opts.shared?"public":"private",shareToken:null}});
   const tx={buildProject:{findFirst:where},buildManagedBinaryUploadIntent:{aggregate,create}};
   const client={ $transaction:async(fn:(transaction:typeof tx)=>Promise<void>,options:{isolationLevel:string})=>{
     expect(options.isolationLevel).toBe("Serializable");await fn(tx);if(opts.rejectCommit)throw Error("serialization conflict");committed=true;
   },buildManagedBinaryUploadIntent:{updateMany:vi.fn(async()=>({count:1}))}};
   const uploader=createDurableManagedBinaryUploader({scope,baseVersion:7,general:true,client:client as unknown as Parameters<typeof createDurableManagedBinaryUploader>[0]["client"],
     store:{putIfAbsent,read:async()=>null},inspectPng:async()=>({mimeType:"image/png"})});
   return {create,aggregate,putIfAbsent,where,upload:()=>uploader.upload({path:"public/image.png",bytes,mimeType:"image/png"})};
 }
 it("commits the scoped budget reservation before PUT",async()=>{
   const f=fixture();const asset=await f.upload();expect(asset.byteLength).toBe(bytes.length);
   expect(f.where).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({id:scope.buildProjectId,codeProject:{ownerId:scope.ownerId,archivedAt:null}})}));
   expect(f.aggregate).toHaveBeenNthCalledWith(1,{where:{ownerId:scope.ownerId},_sum:{byteLength:true},_count:true});
   expect(f.aggregate).toHaveBeenNthCalledWith(2,{where:{ownerId:scope.ownerId,buildProjectId:scope.buildProjectId},_sum:{byteLength:true},_count:true});
   expect(f.create).toHaveBeenCalledTimes(1);expect(f.putIfAbsent).toHaveBeenCalledTimes(1);
 });
 it.each([{wrongOwner:true},{shared:true},{overBudget:true},{rejectCommit:true}])("never PUTs after a rejected reservation %#",async opts=>{
   const f=fixture(opts);await expect(f.upload()).rejects.toThrow();expect(f.putIfAbsent).not.toHaveBeenCalled();
 });
});
