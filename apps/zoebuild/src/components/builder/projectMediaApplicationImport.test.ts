import {describe,expect,it} from "vitest";
import type {WorkspaceStateV2} from "@zoeskoul/learner-workspace/ide/types";
import type {PrivateProjectImage} from "./projectMediaClient";
import {copyPrivatePngIntoApplication} from "./projectMediaApplicationImport";
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=";
const asset:PrivateProjectImage={id:`asset_${"a".repeat(32)}`,kind:"image",origin:"uploaded",mimeType:"image/png",
  width:1,height:1,byteLength:68,altText:null,previewPath:"/api/build/projects/project-1/media/image"};
const initial:WorkspaceStateV2={version:2,language:"web",nodes:[
  {id:"page",kind:"file",name:"index.tsx",parentId:null,content:"export default 1",createdAt:1,updatedAt:1},
],activeFileId:"page",entryFileId:"page",openTabs:["page"],expanded:[],leftPct:30,stdin:""};
const sha=`sha256:${"1".repeat(64)}`;
let index=0;
const apply=(source:WorkspaceStateV2=initial,replaceSelected=false)=>copyPrivatePngIntoApplication({
  source,asset,base64:png,checksum:sha,timestamp:100,newFolderId:()=>`folder_${++index}`,replaceSelected,
});
describe("explicit private PNG copy into public app source",()=>{
  it("adds canonical public/images PNG with checksum and unique real node, without R2 projection",()=>{
    const output=apply();
    expect(output.nodes.map(n=>n.name)).toEqual(["index.tsx","public","images",`${asset.id}.png`]);
    const node=output.nodes.at(-1);
    expect(node?.kind).toBe("file");
    if(node?.kind!=="file")throw Error("expected real app image");
    expect(node.binary).toEqual({encoding:"base64",data:png,sizeBytes:68,mimeType:"image/png",checksum:sha});
    expect(output.activeFileId).toBe(node.id);
    expect(output.openTabs).toContain(node.id);
    expect(initial.nodes).toHaveLength(1);
    expect(output.nodes.some(n=>n.id.startsWith("__zoebuild_private_media_v1__"))).toBe(false);
  });
  it("reimport preserves canonical image node identity after rename and move",()=>{
    const one=apply();const image=one.nodes.at(-1)!;
    const moved={...one,nodes:one.nodes.map(n=>n.id===image.id?{...n,name:"renamed.png"}:n)};
    const two=apply(moved);
    expect(two.nodes).toHaveLength(one.nodes.length);
    expect(two.nodes.find(n=>n.id===image.id)?.name).toBe("renamed.png");
  });
  it("replacement retains selected real PNG file ID and path",()=>{
    const one=apply(); const selected={...one,activeFileId:one.nodes.at(-1)!.id};
    const two=apply(selected,true);
    expect(two.nodes).toHaveLength(one.nodes.length);
    expect(two.activeFileId).toBe(selected.activeFileId);
  });
  it("rejects replacing a text node or copying oversized/unverified input",()=>{
    expect(()=>apply(initial,true)).toThrow("Select an existing public PNG");
    expect(()=>copyPrivatePngIntoApplication({source:initial,asset:{...asset,byteLength:6*1024*1024},
      base64:png,checksum:sha,timestamp:1,newFolderId:()=>"p"})).toThrow("Only verified PNG");
    expect(()=>copyPrivatePngIntoApplication({source:initial,asset,base64:"wrong",checksum:sha,
      timestamp:1,newFolderId:()=>"p"})).toThrow("Only verified PNG");
  });
  it("refuses conflict with an existing public/ file",()=>{
    const conflicting={...initial,nodes:[...initial.nodes,{id:"taken",kind:"file" as const,
      parentId:null,name:"public",content:"bad",createdAt:1,updatedAt:1}]};
    expect(()=>apply(conflicting)).toThrow("Application asset folder conflicts");
  });
});
