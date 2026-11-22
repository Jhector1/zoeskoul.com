import {describe,expect,it} from "vitest";
import {
  prepareAndCommitManagedBinaryRevision,
  loadHydratedManagedBinaryRevision,
  type ManagedBinaryAtomicCommit,
  type ManagedBinaryAtomicSourcePort,
  type ManagedBinaryCommittedRead,
} from "./managedBinaryCommit";
import type {ManagedBinaryRevision,ManagedBinaryScope,ServerVerifiedBinaryAsset} from "./managedBinaryRevision";
import type {ManagedWorkspaceNode} from "./managedBinaryWorkspace";

const scope:ManagedBinaryScope={ownerId:"user_12345678",buildProjectId:"project_12345678"};
const sourceBytes=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1]);
const hash="a930c2bb4e61c0682068f71c4ef427eefbb07098ecea9390e445e7af4b66a384";
const imageId="image_node_0001";
const assetId="asset_123456789";
const key=`project-media/${scope.ownerId}/${scope.buildProjectId}/${assetId}/${hash}`;
const prior:ManagedBinaryRevision={...scope,sourceVersion:7,bindings:[]};
const asset:ServerVerifiedBinaryAsset={...scope,assetId,objectKey:key,sha256:hash,mimeType:"image/png",byteLength:sourceBytes.length};
type W={nodes:ManagedWorkspaceNode[];version:number;language:string;entryFileId:string;activeFileId:string};
const w=(filename="hero.png"):W=>({version:2,language:"web",entryFileId:"index_node_01",activeFileId:imageId,nodes:[
 {id:"public_0001",kind:"folder",name:"public",parentId:null},
 {id:"assets_0001",kind:"folder",name:"assets",parentId:"public_0001"},
 {id:"images_0001",kind:"folder",name:"images",parentId:"assets_0001"},
 {id:imageId,kind:"file",name:filename,parentId:"images_0001",content:"",binary:{encoding:"base64",data:Buffer.from(sourceBytes).toString("base64"),mimeType:"image/png",sizeBytes:sourceBytes.length}},
 {id:"index_node_01",kind:"file",name:"index.tsx",parentId:null,content:"export default 3;"},
]});
function fixture(previous=prior, currentVersion=7){
 const data=new Map<number,ManagedBinaryCommittedRead<W>>();
 const journal:ServerVerifiedBinaryAsset[]=[];
 const uploads:string[]=[];
 let committed:ManagedBinaryAtomicCommit<W>|null=null;
 const port:ManagedBinaryAtomicSourcePort<W>={
  async commitOwnedRevision(prepared){
   if(prepared.scope.ownerId!==scope.ownerId||prepared.scope.buildProjectId!==scope.buildProjectId)throw Error("unauthorized");
   if(prepared.expectedBaseVersion!==currentVersion)return {kind:"conflict"};
   committed=prepared;
   data.set(prepared.sourceVersion,{kind:"managed",snapshot:prepared.snapshot,revision:prepared.revision});
   currentVersion=prepared.sourceVersion;
   return {kind:"committed",sourceVersion:currentVersion};
  },
  async readOwnedRevision({scope:asked,sourceVersion}){
   if(asked.ownerId!==scope.ownerId||asked.buildProjectId!==scope.buildProjectId)return null;
   return data.get(sourceVersion)??null;
  },
 };
 const upload=async({path,bytes,mimeType}:{path:string;bytes:Uint8Array;mimeType:string})=>{
  expect(path.startsWith("public/")).toBe(true);
  expect(Buffer.from(bytes)).toEqual(Buffer.from(sourceBytes));
  expect(mimeType).toBe("image/png");
  uploads.push(path);
  return asset;
 };
 const journalWrite=async(row:ServerVerifiedBinaryAsset)=>{journal.push(row);};
 return {port,upload,journalWrite,journal,uploads,data,previous,get committed(){return committed;}};
}

describe("AI4B4E2B2: guarded atomic source commit port",()=>{
 it("stages, strips and submits a version-matched private manifest in one commit call",async()=>{
  const f=fixture();
  const result=await prepareAndCommitManagedBinaryRevision({scope,baseVersion:7,previous:f.previous,workspace:w(),upload:f.upload,journal:f.journalWrite,port:f.port});
  expect(result).toEqual({sourceVersion:8,stagedAssets:1});
  expect(f.uploads).toEqual(["public/assets/images/hero.png"]);
  expect(f.journal).toEqual([asset]);
  expect(f.committed?.snapshot.workspace.nodes[3]).not.toHaveProperty("binary");
  expect(JSON.stringify(f.committed?.snapshot)).not.toContain(Buffer.from(sourceBytes).toString("base64"));
  expect(f.committed?.revision.bindings[0].objectKey).toBe(key);
  const out=await loadHydratedManagedBinaryRevision({scope,sourceVersion:8,port:f.port,readObject:async k=>k===key?sourceBytes:null});
  expect(out?.nodes[3].binary?.data).toBe(Buffer.from(sourceBytes).toString("base64"));
  expect(out?.nodes[4].content).toBe("export default 3;");
 });
 it("reuses a pinned image on rename without re-uploading or mutating old revision",async()=>{
  const previous:ManagedBinaryRevision={...prior,bindings:[{...asset,nodeId:imageId,path:"public/assets/images/old.png"}]};
  const f=fixture(previous);
  const result=await prepareAndCommitManagedBinaryRevision({scope,baseVersion:7,previous,workspace:w("new.png"),upload:f.upload,journal:f.journalWrite,port:f.port});
  expect(result.stagedAssets).toBe(0);
  expect(f.uploads).toHaveLength(0);
  expect(f.committed?.revision.bindings[0].path).toBe("public/assets/images/new.png");
  expect(previous.bindings[0].path).toBe("public/assets/images/old.png");
 });
 it("keeps staged upload in journal when CAS refuses a stale writer",async()=>{
  const f=fixture(prior,8);
  await expect(prepareAndCommitManagedBinaryRevision({scope,baseVersion:7,previous:prior,workspace:w(),upload:f.upload,journal:f.journalWrite,port:f.port})).rejects.toThrow("MANAGED_ATOMIC_SOURCE_CONFLICT");
  expect(f.journal).toHaveLength(1);
  expect(f.data.size).toBe(0);
 });
 it("fails before upload for a mismatched project owner",async()=>{
  const f=fixture();
  await expect(prepareAndCommitManagedBinaryRevision({scope:{...scope,ownerId:"other_123456"},baseVersion:7,previous:prior,workspace:w(),upload:f.upload,journal:f.journalWrite,port:f.port})).rejects.toThrow("MANAGED_BINARY_REVISION_MISMATCH");
  expect(f.uploads).toHaveLength(0);
 });
 it("does not commit when staging reports mismatched R2 digest",async()=>{
  const f=fixture();
  await expect(prepareAndCommitManagedBinaryRevision({scope,baseVersion:7,previous:prior,workspace:w(),upload:async()=>({...asset,sha256:"0".repeat(64),objectKey:key.replace(hash,"0".repeat(64))}),journal:f.journalWrite,port:f.port})).rejects.toThrow("MANAGED_BINARY_STAGED_HASH_MISMATCH");
  expect(f.committed).toBeNull();
 });
 it("rejects fabricated successful commit acknowledgement",async()=>{
  const f=fixture();
  const bad:ManagedBinaryAtomicSourcePort<W>={...f.port,commitOwnedRevision:async()=>({kind:"committed",sourceVersion:999})};
  await expect(prepareAndCommitManagedBinaryRevision({scope,baseVersion:7,previous:prior,workspace:w(),upload:f.upload,journal:f.journalWrite,port:bad})).rejects.toThrow("MANAGED_ATOMIC_COMMIT_INVALID");
 });
 it("rejects owner/version swaps while reading committed snapshots",async()=>{
  const f=fixture();
  await prepareAndCommitManagedBinaryRevision({scope,baseVersion:7,previous:prior,workspace:w(),upload:f.upload,journal:f.journalWrite,port:f.port});
  await expect(loadHydratedManagedBinaryRevision({scope:{...scope,ownerId:"other_123456"},sourceVersion:8,port:{...f.port,readOwnedRevision:async()=>f.data.get(8)!},readObject:async()=>sourceBytes})).rejects.toThrow("MANAGED_BINARY_REVISION_MISMATCH");
  await expect(loadHydratedManagedBinaryRevision({scope,sourceVersion:9,port:{...f.port,readOwnedRevision:async()=>f.data.get(8)!},readObject:async()=>sourceBytes})).rejects.toThrow("MANAGED_BINARY_REVISION_MISMATCH");
 });
 it("refuses corrupted R2 bytes and missing objects when hydrating",async()=>{
  const f=fixture();
  await prepareAndCommitManagedBinaryRevision({scope,baseVersion:7,previous:prior,workspace:w(),upload:f.upload,journal:f.journalWrite,port:f.port});
  await expect(loadHydratedManagedBinaryRevision({scope,sourceVersion:8,port:f.port,readObject:async()=>null})).rejects.toThrow("MANAGED_BINARY_OBJECT_INTEGRITY_FAILURE");
  await expect(loadHydratedManagedBinaryRevision({scope,sourceVersion:8,port:f.port,readObject:async()=>Uint8Array.from([...sourceBytes.slice(0,-1),42])})).rejects.toThrow("MANAGED_BINARY_OBJECT_INTEGRITY_FAILURE");
 });
 it("returns legacy inline snapshots without requesting R2 bytes",async()=>{
  const f=fixture();let reads=0;const original=w();
  const port:ManagedBinaryAtomicSourcePort<W>={...f.port,readOwnedRevision:async()=>({kind:"legacy",workspace:original})};
  expect(await loadHydratedManagedBinaryRevision({scope,sourceVersion:7,port,readObject:async()=>{reads++;return null;}})).toEqual(original);
  expect(reads).toBe(0);
 });
 it("refuses untrusted storage envelopes",async()=>{
  const f=fixture();
  await prepareAndCommitManagedBinaryRevision({scope,baseVersion:7,previous:prior,workspace:w(),upload:f.upload,journal:f.journalWrite,port:f.port});
  const legitimate=f.data.get(8)!;
  const forged={...legitimate,snapshot:{...legitimate.snapshot,sourceVersion:9}};
  const port:ManagedBinaryAtomicSourcePort<W>={...f.port,readOwnedRevision:async()=>forged};
  await expect(loadHydratedManagedBinaryRevision({scope,sourceVersion:8,port,readObject:async()=>sourceBytes})).rejects.toThrow("MANAGED_WORKSPACE_SNAPSHOT_VERSION_MISMATCH");
 });
 it("never commits if durable cleanup journal rejects the staged object",async()=>{
  const f=fixture();
  await expect(prepareAndCommitManagedBinaryRevision({scope,baseVersion:7,previous:prior,workspace:w(),upload:f.upload,journal:async()=>{throw Error("journal unavailable")},port:f.port})).rejects.toThrow("journal unavailable");
  expect(f.committed).toBeNull();
 });
 it("supports empty projects and never synthesizes asset folders",async()=>{
  const f=fixture();const project=w();project.nodes=project.nodes.filter(n=>n.kind!=="folder"&&n.id!==imageId);
  project.activeFileId="index_node_01";
  const result=await prepareAndCommitManagedBinaryRevision({scope,baseVersion:7,previous:prior,workspace:project,upload:f.upload,journal:f.journalWrite,port:f.port});
  expect(result.stagedAssets).toBe(0);
  expect(f.committed?.snapshot.workspace.nodes).toHaveLength(1);
 });
 it("rejects version overflow and invalid version before upload",async()=>{
  const f=fixture();
  await expect(prepareAndCommitManagedBinaryRevision({scope,baseVersion:Number.MAX_SAFE_INTEGER,previous:prior,workspace:w(),upload:f.upload,journal:f.journalWrite,port:f.port})).rejects.toThrow("MANAGED_ATOMIC_VERSION_INVALID");
  expect(f.uploads).toHaveLength(0);
 });
 it("fails closed if an unrecognized read record comes from the port",async()=>{
  const f=fixture();
  const port:ManagedBinaryAtomicSourcePort<W>={...f.port,readOwnedRevision:async()=>({kind:"other"} as never)};
  await expect(loadHydratedManagedBinaryRevision({scope,sourceVersion:7,port,readObject:async()=>null})).rejects.toThrow("MANAGED_ATOMIC_RECORD_INVALID");
 });
});
