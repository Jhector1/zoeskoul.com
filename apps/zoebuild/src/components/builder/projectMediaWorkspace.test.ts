import {describe,expect,it} from "vitest";
import type {WorkspaceStateV2} from "@zoeskoul/learner-workspace/ide/types";
import type {PrivateProjectImage} from "./projectMediaClient";
import {
  projectMediaNodeId, projectPrivateMediaIntoFullIDE,
  privateMediaProjectionIsIntact, removePrivateMediaProjection,
} from "./projectMediaWorkspace";

const id = `asset_${"a".repeat(32)}`;
const asset:PrivateProjectImage = {
  id,kind:"image",origin:"uploaded",mimeType:"image/png",
  width:1,height:1,byteLength:68,altText:"Hero",previewPath:`/api/build/projects/project-001/media/${id}`,
};
const source:WorkspaceStateV2 = {
  version:2,language:"web",nodes:[
    {id:"src",kind:"folder",name:"src",parentId:null,createdAt:1,updatedAt:1},
    {id:"index",kind:"file",name:"index.tsx",parentId:"src",content:"export default 1",createdAt:1,updatedAt:1},
  ],entryFileId:"index",activeFileId:"index",openTabs:["index"],stdin:"",expanded:["src"],leftPct:26,
};

describe("private R2 assets in native FullIDE, without FullIDE modification",()=>{
  const project = (items:PrivateProjectImage[]=[asset]) => projectPrivateMediaIntoFullIDE({
    source,images:items,loaded:new Map(),
  });
  it("adds ordinary public/assets/images folder nodes",()=>{
    const p=project();
    expect(p.workspace.nodes.some(n=>n.kind==="folder"&&n.name==="public")).toBe(true);
    expect(p.workspace.nodes.some(n=>n.kind==="folder"&&n.name==="assets")).toBe(true);
    expect(p.workspace.nodes.some(n=>n.kind==="folder"&&n.name==="images")).toBe(true);
    expect(p.workspace.nodes.find(n=>n.id===projectMediaNodeId(id))?.kind).toBe("file");
  });
  it("does not synthesize empty folders for a project with no media",()=>{
    const empty=project([]);
    expect(empty.workspace).toEqual(source);
    expect(empty.workspace.nodes).toHaveLength(source.nodes.length);
    expect(empty.virtualNodeIds.size).toBe(0);
    expect(empty.assetByNodeId.size).toBe(0);
    expect(privateMediaProjectionIsIntact(empty.workspace,empty)).toBe(true);
    expect(removePrivateMediaProjection(empty.workspace,empty,source)).toEqual(source);
  });
  it("preserves genuine public and assets folders when no cloud media exists",()=>{
    const physical={...source,nodes:[...source.nodes,
      {id:"real-public",kind:"folder" as const,name:"public",parentId:null,createdAt:1,updatedAt:1},
      {id:"real-assets",kind:"folder" as const,name:"assets",parentId:"real-public",createdAt:1,updatedAt:1},
    ]};
    const empty=projectPrivateMediaIntoFullIDE({source:physical,images:[],loaded:new Map()});
    expect(empty.workspace).toEqual(physical);
    expect(empty.virtualNodeIds.size).toBe(0);
    expect(privateMediaProjectionIsIntact(empty.workspace,empty)).toBe(true);
  });
  it("does not carry media from a prior project into a fresh empty project",()=>{
    const withImages=project([asset]);
    expect(withImages.workspace.nodes.some(n=>n.name==="images")).toBe(true);
    const nextSource={...source,nodes:source.nodes.map(n=>({...n}))};
    const withoutImages=projectPrivateMediaIntoFullIDE({
      source:nextSource,images:[],loaded:new Map(),selectedAssetId:id,
    });
    expect(withoutImages.workspace).toEqual(nextSource);
    expect(withoutImages.workspace.openTabs).toEqual(nextSource.openTabs);
    expect(withoutImages.workspace.nodes.some(n=>n.name==="images")).toBe(false);
  });
  it("native binary viewer sees a valid placeholder, without downloading originals",()=>{
    const n=project().workspace.nodes.find(n=>n.id===projectMediaNodeId(id));
    expect(n?.kind).toBe("file");
    if(n?.kind==="file"){
      expect(n.binary?.encoding).toBe("base64");
      expect(n.binary?.sizeBytes).toBe(68);
      expect(n.binary?.mimeType).toBe("image/png");
    }
  });
  it("never modifies canonical source or generates a phantom source change",()=>{
    const p=project();
    expect(source.nodes).toHaveLength(2);
    const clean=removePrivateMediaProjection(p.workspace,p,source);
    expect(clean).toEqual(source);
  });
  it("opens an R2-backed image in native FullIDE tab using selected asset ID",()=>{
    const p=projectPrivateMediaIntoFullIDE({source,images:[asset],loaded:new Map(),selectedAssetId:id});
    expect(p.workspace.activeFileId).toBe(projectMediaNodeId(id));
    expect(p.workspace.openTabs).toContain(projectMediaNodeId(id));
    const clean=removePrivateMediaProjection(p.workspace,p,source);
    expect(clean.openTabs).toEqual(source.openTabs);
    expect(clean.activeFileId).toBe(source.activeFileId);
  });
  it("retains ordinary edits when stripping virtual assets",()=>{
    const p=project();
    const nodes=p.workspace.nodes.map(n=>n.id==="index" && n.kind==="file"?{...n,content:"changed"}:n);
    const clean=removePrivateMediaProjection({...p.workspace,nodes},p,source);
    const edited=clean.nodes.find(n=>n.id==="index");
    expect(edited?.kind==="file" ? edited.content : undefined).toBe("changed");
  });
  it("preserves a renamed canonical binary node and its bytes while keeping virtual media read-only",()=>{
    const binary={encoding:"base64" as const,data:"AQID",sizeBytes:3,mimeType:"image/png"};
    const photo={id:"photo",kind:"file" as const,name:"old.png",parentId:null,content:"",binary,
      createdAt:1,updatedAt:1};
    const before={...source,nodes:[...source.nodes,photo],activeFileId:"photo",openTabs:["photo"]};
    const p=projectPrivateMediaIntoFullIDE({source:before,images:[asset],loaded:new Map()});
    const displayed={...p.workspace,nodes:p.workspace.nodes.map(node=>node.id==="photo"?{...node,name:"new.png",updatedAt:2}:node)};
    expect(privateMediaProjectionIsIntact(displayed,p)).toBe(true);
    const clean=removePrivateMediaProjection(displayed,p,before);
    expect(clean.nodes.find(node=>node.id==="photo")).toEqual({...photo,name:"new.png",updatedAt:2});
    expect(clean.openTabs).toEqual(["photo"]);
    expect(clean.activeFileId).toBe("photo");
    expect(clean.nodes.some(node=>node.id===projectMediaNodeId(id))).toBe(false);
  });
  it("refuses a user source node inside a synthetic media folder",()=>{
    const p=project();
    const mediaFolder=p.workspace.nodes.find(n=>n.kind==="folder"&&n.name==="images");
    expect(()=>removePrivateMediaProjection({...p.workspace,nodes:[...p.workspace.nodes,
      {id:"hijack",kind:"file",name:"hijack.ts",parentId:mediaFolder?.id??null,content:"bad",createdAt:1,updatedAt:1}]},p,source))
      .toThrow("PROJECT_MEDIA_READ_ONLY_FOLDER");
  });
  it("rejects deletion of a real source folder used as an image ancestor",()=>{
    const p=projectPrivateMediaIntoFullIDE({
      source:{...source,nodes:[...source.nodes,
        {id:"existing-public",kind:"folder",name:"public",parentId:null,createdAt:1,updatedAt:1}]},
      images:[asset],loaded:new Map(),
    });
    expect(privateMediaProjectionIsIntact({...p.workspace,
      nodes:p.workspace.nodes.filter(n=>n.id!=="existing-public")},p)).toBe(false);
  });
  it("detects attempted virtual file deletion and rename",()=>{
    const p=project();
    expect(privateMediaProjectionIsIntact({...p.workspace,nodes:p.workspace.nodes.filter(n=>n.id!==projectMediaNodeId(id))},p)).toBe(false);
    expect(privateMediaProjectionIsIntact({...p.workspace,nodes:p.workspace.nodes.map(n=>n.id===projectMediaNodeId(id)?{...n,name:"changed.png"}:n)},p)).toBe(false);
  });
  it("never overwrites an existing source file with an R2 virtual asset",()=>{
    const p=project();
    const file=p.workspace.nodes.find(n=>n.id===projectMediaNodeId(id));
    expect(()=>projectPrivateMediaIntoFullIDE({
      source:{...source,nodes:[...source.nodes,{...file!,id:"physical-file"}]},
      images:[asset],loaded:new Map(),
    })).toThrow("PROJECT_MEDIA_SOURCE_NAME_COLLISION");
  });
  it("refuses reserved source node IDs and duplicate cloud records",()=>{
    expect(()=>projectPrivateMediaIntoFullIDE({
      source:{...source,nodes:[...source.nodes,{id:projectMediaNodeId(id),kind:"folder",name:"unsafe",parentId:null,createdAt:1,updatedAt:1}]},
      images:[asset],loaded:new Map(),
    })).toThrow("PROJECT_MEDIA_RESERVED_SOURCE_NODE");
    expect(()=>project([asset,asset])).toThrow("PROJECT_MEDIA_DUPLICATE_ASSET");
  });
  it("uses native binary representation when the selected image has been loaded",()=>{
    const binary={encoding:"base64" as const,data:"AQID",sizeBytes:3,mimeType:"image/png"};
    const p=projectPrivateMediaIntoFullIDE({source,images:[asset],loaded:new Map([[asset.id,binary]])});
    const n=p.workspace.nodes.find(x=>x.id===projectMediaNodeId(id));
    if(n?.kind!=="file")throw Error("Expected image node");
    expect(n.binary).toMatchObject(binary);
    expect(privateMediaProjectionIsIntact(p.workspace,p)).toBe(true);
  });
  it("reuses physical public/assets/images folders rather than creating duplicates",()=>{
    const parent={id:"public",kind:"folder" as const,name:"public",parentId:null,createdAt:1,updatedAt:1};
    const a={id:"assets",kind:"folder" as const,name:"assets",parentId:"public",createdAt:1,updatedAt:1};
    const images={id:"images",kind:"folder" as const,name:"images",parentId:"assets",createdAt:1,updatedAt:1};
    const real={...source,nodes:[...source.nodes,parent,a,images]};
    const p=projectPrivateMediaIntoFullIDE({source:real,images:[asset],loaded:new Map()});
    expect(p.workspace.nodes.filter(n=>n.kind==="folder"&&n.name==="images")).toHaveLength(1);
    expect(removePrivateMediaProjection(p.workspace,p,real).nodes).toEqual(real.nodes);
  });
});
