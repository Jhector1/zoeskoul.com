import {describe,it,expect,vi} from "vitest";
import {stageCanonicalFullIDEImages} from "./managedBinaryStaging";
import type {NativeBinaryNode} from "./managedBinaryStaging";
import type {ManagedBinaryRevision,ServerVerifiedBinaryAsset} from "./managedBinaryRevision";

const scope={ownerId:"owner_test",buildProjectId:"build_test"};
const original:ManagedBinaryRevision={...scope,sourceVersion:6,bindings:[]};
const png=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1]);
const image=(id="file_img",parentId:string|null="folder_img",data=png):NativeBinaryNode=>({
 id,kind:"file",name:"hero.png",parentId,content:"",binary:{encoding:"base64",data:Buffer.from(data).toString("base64"),mimeType:"image/png",sizeBytes:data.byteLength},
});
const nodes=():NativeBinaryNode[]=>[
 {id:"folder_img",kind:"folder",name:"images",parentId:"folder_assets"},
 {id:"folder_assets",kind:"folder",name:"assets",parentId:"folder_public"},
 {id:"folder_public",kind:"folder",name:"public",parentId:null},
 image(),
];
async function sha(bytes:Uint8Array){const a=await crypto.subtle.digest("SHA-256",Uint8Array.from(bytes).buffer);return Buffer.from(a).toString("hex");}
const asset=async(bytes=png,override:Partial<ServerVerifiedBinaryAsset>={}):Promise<ServerVerifiedBinaryAsset>=>{
 const sha256=await sha(bytes);const assetId="asset_1234567890123456";
 return {...scope,assetId,objectKey:`project-media/${scope.ownerId}/${scope.buildProjectId}/${assetId}/${sha256}`,sha256,mimeType:"image/png",byteLength:bytes.length,...override};
};
async function run(args:Partial<Parameters<typeof stageCanonicalFullIDEImages>[0]>={}){
 const upload=vi.fn(async()=>asset());const journal=vi.fn(async()=>{});
 const result=await stageCanonicalFullIDEImages({scope,previous:original,baseVersion:6,nodes:nodes(),upload,journal,...args});
 return {result,upload,journal};
}
describe("AI4B4E2A isolated native R2 staging",()=>{
 it("stages native FullIDE bytes with canonical path and verified binding",async()=>{
  const {result,upload,journal}=await run();
  expect(result.revision.sourceVersion).toBe(7);
  expect(result.revision.bindings[0].path).toBe("public/assets/images/hero.png");
  expect(upload).toHaveBeenCalledOnce();expect(journal).toHaveBeenCalledOnce();
 });
 it("does not reupload unchanged content after rename",async()=>{
  const prior=await asset();const old:ManagedBinaryRevision={...scope,sourceVersion:6,bindings:[{...prior,nodeId:"file_img",path:"public/assets/images/old.png"}]};
  const {result,upload}=await run({previous:old});
  expect(result.newlyStored).toHaveLength(0);expect(upload).not.toHaveBeenCalled();
  expect(result.revision.bindings[0].path).toBe("public/assets/images/hero.png");
 });
 it("keeps historical binding after deletion",async()=>{
  const prior=await asset();const old:ManagedBinaryRevision={...scope,sourceVersion:6,bindings:[{...prior,nodeId:"file_img",path:"public/assets/images/old.png"}]};
  const {result,upload}=await run({previous:old,nodes:[]});
  expect(upload).not.toHaveBeenCalled();expect(result.revision.bindings).toEqual([]);
  expect(old.bindings).toHaveLength(1);
 });
 it("rejects an asset returned from another project",async()=>{
  await expect(run({upload:async()=>asset(png,{buildProjectId:"other_project"})})).rejects.toThrow("MANAGED_BINARY_SCOPE_MISMATCH");
 });
 it("rejects an asset returned from another owner",async()=>{
  await expect(run({upload:async()=>asset(png,{ownerId:"other_owner"})})).rejects.toThrow("MANAGED_BINARY_SCOPE_MISMATCH");
 });
 it("rejects incorrect uploaded digest",async()=>{
  await expect(run({upload:async()=>asset(png,{sha256:"a".repeat(64)})})).rejects.toThrow();
 });
 it("rejects wrong declared image size before upload",async()=>{
  const changed=nodes();changed[3]={...changed[3],binary:{...image().binary!,sizeBytes:2}};
  const upload=vi.fn(async()=>asset());
  await expect(run({nodes:changed,upload})).rejects.toThrow("MANAGED_BINARY_BASE64_INVALID");
  expect(upload).not.toHaveBeenCalled();
 });
 it("rejects unsafe relative path before upload",async()=>{
  const changed=nodes();changed[0]={...changed[0],name:".."};
  const upload=vi.fn(async()=>asset());
  await expect(run({nodes:changed,upload})).rejects.toThrow("MANAGED_BINARY_NODE_NAME_INVALID");
  expect(upload).not.toHaveBeenCalled();
 });
 it("rejects parent cycles before upload",async()=>{
  const changed=nodes();changed[2]={...changed[2],parentId:"folder_img"};
  const upload=vi.fn(async()=>asset());
  await expect(run({nodes:changed,upload})).rejects.toThrow("MANAGED_BINARY_PARENT_CYCLE");
  expect(upload).not.toHaveBeenCalled();
 });
 it("rejects a forged PNG signature before upload",async()=>{
  const changed=nodes(); changed[3]=image("file_img","folder_img",Uint8Array.from(new Uint8Array(png.length)));
  const upload=vi.fn(async()=>asset());
  await expect(run({nodes:changed,upload})).rejects.toThrow("MANAGED_BINARY_SIGNATURE_INVALID");
  expect(upload).not.toHaveBeenCalled();
 });
 it("rejects wrong mime for extension",async()=>{
  const changed=nodes();changed[3]={...changed[3],binary:{...image().binary!,mimeType:"image/jpeg"}};
  const upload=vi.fn(async()=>asset());
  await expect(run({nodes:changed,upload})).rejects.toThrow("MANAGED_BINARY_MIME_PATH_MISMATCH");
  expect(upload).not.toHaveBeenCalled();
 });
 it("rejects stale source base revision",async()=>{
  await expect(run({baseVersion:5})).rejects.toThrow("MANAGED_BINARY_REVISION_MISMATCH");
 });
 it("reuses one staging upload for identical eligible content in multiple files",async()=>{
  const changed=nodes();changed.push({...image("file_2"),name:"other.png"});
  const {result,upload}=await run({nodes:changed});
  expect(upload).toHaveBeenCalledOnce();expect(result.revision.bindings).toHaveLength(2);
 });
 it("requires durable journal before returning binding",async()=>{
  await expect(run({journal:async()=>{throw Error("journal-failed")}})).rejects.toThrow("journal-failed");
 });
 it("does not stage non-image project binary files",async()=>{
  const changed=nodes();changed[3]={...changed[3],name:"guide.pdf",binary:{...image().binary!,mimeType:"application/pdf"}};
  const {result,upload}=await run({nodes:changed});
  expect(result.revision.bindings).toEqual([]);expect(upload).not.toHaveBeenCalled();
 });
});
