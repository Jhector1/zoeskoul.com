import {describe,expect,it} from "vitest";
import {
  stripVerifiedManagedBinaryWorkspace,
  hydrateVerifiedManagedBinaryWorkspace,
} from "./managedBinaryWorkspace";
import type {ManagedBinaryRevision} from "./managedBinaryRevision";
import type {ManagedWorkspaceNode} from "./managedBinaryWorkspace";

const scope={ownerId:"user_12345678",buildProjectId:"project_12345678"};
const bytes=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1]);
const assetId="asset_123456789";
const hash="a930c2bb4e61c0682068f71c4ef427eefbb07098ecea9390e445e7af4b66a384";
const key=`project-media/${scope.ownerId}/${scope.buildProjectId}/${assetId}/${hash}`;
const revision:ManagedBinaryRevision={...scope,sourceVersion:7,bindings:[{
  ...scope,nodeId:"image_node_0001",path:"public/assets/images/hero.png",assetId,
  objectKey:key,sha256:hash,mimeType:"image/png",byteLength:bytes.length,
}]};
const image={id:"image_node_0001",kind:"file" as const,name:"hero.png",parentId:"img_folder_01",content:"",binary:{encoding:"base64",data:Buffer.from(bytes).toString("base64"),mimeType:"image/png",sizeBytes:bytes.length}};
function workspace():{version:number;language:string;leftPct:number;entryFileId:string;activeFileId:string;openTabs:string[];expanded:string[];stdin:string;nodes:ManagedWorkspaceNode[]}{return {version:2,language:"web",leftPct:30,entryFileId:"index_node_01",activeFileId:"image_node_0001",openTabs:["image_node_0001"],expanded:[],stdin:"",nodes:[
  {id:"public_root_01",kind:"folder" as const,name:"public",parentId:null},
  {id:"assets_folder_01",kind:"folder" as const,name:"assets",parentId:"public_root_01"},
  {id:"img_folder_01",kind:"folder" as const,name:"images",parentId:"assets_folder_01"},
  image,
  {id:"index_node_01",kind:"file" as const,name:"index.tsx",parentId:null,content:"export const value = 7;"},
]};}
const store=async(key:string)=>key===revision.bindings[0].objectKey?Uint8Array.from(bytes):null;

describe("AI4B4E2B1: private R2-backed source envelope",()=>{
  it("strips managed image bytes without changing text source or navigation",async()=>{
    const w=workspace();const result=await stripVerifiedManagedBinaryWorkspace({scope,revision,sourceVersion:7,workspace:w});
    expect(result.format).toBe("zoebuild-r2-binary-snapshot-v1");
    expect(JSON.stringify(result)).not.toContain(image.binary.data);
    expect(result.workspace.nodes[4]).toEqual(w.nodes[4]);
    expect(result.workspace.activeFileId).toBe("image_node_0001");
    expect(w.nodes[3]).toEqual(image);
  });
  it("hydrates exact bytes for old FullIDE and preview consumers",async()=>{
    const w=workspace();const stored=await stripVerifiedManagedBinaryWorkspace({scope,revision,sourceVersion:7,workspace:w});
    const restored=await hydrateVerifiedManagedBinaryWorkspace({scope,revision,sourceVersion:7,stored,readObject:store});
    expect(restored.nodes[3]).toEqual({...image,binary:{...image.binary,checksum:`sha256:${hash}`}});
    expect(restored.nodes[4]).toEqual(w.nodes[4]);
    expect(stored.workspace.nodes[3]).not.toHaveProperty("binary");
  });
  it("refuses owner swap, even with identical source version",async()=>{
    await expect(stripVerifiedManagedBinaryWorkspace({scope:{...scope,ownerId:"attacker_1234"},revision,sourceVersion:7,workspace:workspace()})).rejects.toThrow("MANAGED_BINARY_REVISION_MISMATCH");
  });
  it("refuses source version mismatch and stale historical hydration",async()=>{
    await expect(stripVerifiedManagedBinaryWorkspace({scope,revision,sourceVersion:8,workspace:workspace()})).rejects.toThrow("MANAGED_BINARY_REVISION_MISMATCH");
    const stored=await stripVerifiedManagedBinaryWorkspace({scope,revision,sourceVersion:7,workspace:workspace()});
    await expect(hydrateVerifiedManagedBinaryWorkspace({scope,revision,sourceVersion:8,stored,readObject:store})).rejects.toThrow();
  });
  it("rejects renamed file if binding path was not atomically revised",async()=>{
    const w=workspace();w.nodes[3]={...w.nodes[3],name:"renamed.png"};
    await expect(stripVerifiedManagedBinaryWorkspace({scope,revision,sourceVersion:7,workspace:w})).rejects.toThrow("MANAGED_WORKSPACE_BINDING_MISMATCH");
  });
  it("rejects deleted files with dangling live bindings",async()=>{
    const w=workspace();w.nodes.splice(3,1);
    await expect(stripVerifiedManagedBinaryWorkspace({scope,revision,sourceVersion:7,workspace:w})).rejects.toThrow("MANAGED_WORKSPACE_BINDING_MISMATCH");
  });
  it("rejects unbound image payloads before stripping",async()=>{
    const w=workspace();w.nodes.push({...image,id:"image_node_0002",name:"other.png"});
    await expect(stripVerifiedManagedBinaryWorkspace({scope,revision,sourceVersion:7,workspace:w})).rejects.toThrow("MANAGED_WORKSPACE_UNBOUND_IMAGE");
  });
  it("rejects mismatched inline bytes and MIME",async()=>{
    const w=workspace();w.nodes[3]={...image,binary:{...image.binary,data:Buffer.from([1,2,3]).toString("base64")}};
    await expect(stripVerifiedManagedBinaryWorkspace({scope,revision,sourceVersion:7,workspace:w})).rejects.toThrow("MANAGED_WORKSPACE_INLINE_INVALID");
    w.nodes[3]={...image,binary:{...image.binary,mimeType:"image/jpeg"}};
    await expect(stripVerifiedManagedBinaryWorkspace({scope,revision,sourceVersion:7,workspace:w})).rejects.toThrow("MANAGED_WORKSPACE_INLINE_INVALID");
  });
  it("rejects an incorrect manifest hash",async()=>{
    const changed={...revision,bindings:[{...revision.bindings[0],sha256:"0".repeat(64),objectKey:key.replace(hash,"0".repeat(64))}]};
    await expect(stripVerifiedManagedBinaryWorkspace({scope,revision:changed,sourceVersion:7,workspace:workspace()})).rejects.toThrow("MANAGED_WORKSPACE_INLINE_HASH_MISMATCH");
  });
  it("refuses object replacement or disappearance on hydration",async()=>{
    const stored=await stripVerifiedManagedBinaryWorkspace({scope,revision,sourceVersion:7,workspace:workspace()});
    await expect(hydrateVerifiedManagedBinaryWorkspace({scope,revision,sourceVersion:7,stored,readObject:async()=>null})).rejects.toThrow("MANAGED_BINARY_OBJECT_INTEGRITY_FAILURE");
    await expect(hydrateVerifiedManagedBinaryWorkspace({scope,revision,sourceVersion:7,stored,readObject:async()=>Uint8Array.from([...bytes.slice(0,-1),55])})).rejects.toThrow("MANAGED_BINARY_OBJECT_INTEGRITY_FAILURE");
  });
  it("rejects a stored snapshot that sneaks binary bytes back in",async()=>{
    const stored=await stripVerifiedManagedBinaryWorkspace({scope,revision,sourceVersion:7,workspace:workspace()});
    const forged={...stored,workspace:workspace()};
    await expect(hydrateVerifiedManagedBinaryWorkspace({scope,revision,sourceVersion:7,stored:forged,readObject:store})).rejects.toThrow("MANAGED_WORKSPACE_STRIPPED_BYTES_PRESENT");
  });
  it("rejects malformed parent graph and duplicate sibling names",async()=>{
    const w=workspace();w.nodes[0]={...w.nodes[0],parentId:"img_folder_01"};
    await expect(stripVerifiedManagedBinaryWorkspace({scope,revision,sourceVersion:7,workspace:w})).rejects.toThrow("MANAGED_WORKSPACE_PARENT_CYCLE");
    const d=workspace();d.nodes.push({id:"another_folder",kind:"folder",name:"PUBLIC",parentId:null});
    await expect(stripVerifiedManagedBinaryWorkspace({scope,revision,sourceVersion:7,workspace:d})).rejects.toThrow("MANAGED_WORKSPACE_SIBLING_CONFLICT");
  });
  it("supports historical revision no longer containing the former file",async()=>{
    const old=await stripVerifiedManagedBinaryWorkspace({scope,revision,sourceVersion:7,workspace:workspace()});
    const newer={...revision,sourceVersion:8,bindings:[]};
    const current=workspace();current.nodes.splice(3,1);current.activeFileId="index_node_01";current.openTabs=["index_node_01"];
    const empty=await stripVerifiedManagedBinaryWorkspace({scope,revision:newer,sourceVersion:8,workspace:current});
    const restoredOld=await hydrateVerifiedManagedBinaryWorkspace({scope,revision,sourceVersion:7,stored:old,readObject:store});
    const restoredNew=await hydrateVerifiedManagedBinaryWorkspace({scope,revision:newer,sourceVersion:8,stored:empty,readObject:store});
    expect(restoredOld.nodes.some(n=>n.id==="image_node_0001")).toBe(true);
    expect(restoredNew.nodes.some(n=>n.id==="image_node_0001")).toBe(false);
  });
  it("supports empty media project without creating synthetic folders",async()=>{
    const rev={...revision,bindings:[]};
    const w={...workspace(),nodes:[{id:"index_node_01",kind:"file" as const,name:"index.tsx",parentId:null,content:"export default 1"}]};
    const stored=await stripVerifiedManagedBinaryWorkspace({scope,revision:rev,sourceVersion:7,workspace:w});
    expect(stored.workspace.nodes).toHaveLength(1);
    const opened=await hydrateVerifiedManagedBinaryWorkspace({scope,revision:rev,sourceVersion:7,stored,readObject:store});
    expect(opened.nodes).toEqual(w.nodes);
  });
});
