import {describe,it,expect} from "vitest";
import {privateMediaPath,readPrivateMediaPage} from "./projectMediaClient";
const project="project-001";
const id=`asset_${"a".repeat(32)}`;
const asset={id,kind:"image",origin:"uploaded",mimeType:"image/png",width:10,height:10,
  byteLength:256,altText:null,previewPath:privateMediaPath(project,id)};
describe("AI4B4B private media client boundary",()=>{
  it("only accepts expected same-origin project media URLs",()=>{
    expect(privateMediaPath(project,id)).toBe(`/api/build/projects/${project}/media/${id}`);
    expect(()=>privateMediaPath(project,"../../etc/passwd")).toThrow();
    expect(()=>readPrivateMediaPage({ok:true,items:[{...asset,previewPath:"https://example.com/image"}],nextCursor:null},project)).toThrow();
    expect(()=>readPrivateMediaPage({ok:true,items:[asset],nextCursor:null},"another-project")).toThrow();
  });
  it("rejects HTML, SVG, malformed metadata and duplicate rows",()=>{
    expect(()=>readPrivateMediaPage({ok:true,items:[{...asset,mimeType:"image/svg+xml"}],nextCursor:null},project)).toThrow();
    expect(()=>readPrivateMediaPage({ok:true,items:[{...asset,byteLength:Infinity}],nextCursor:null},project)).toThrow();
    expect(()=>readPrivateMediaPage({ok:true,items:[asset,asset],nextCursor:null},project)).toThrow();
    expect(()=>readPrivateMediaPage({ok:true,items:[],nextCursor:"../../escape"},project)).toThrow();
    expect(()=>readPrivateMediaPage({ok:true,items:Array(41).fill(asset),nextCursor:null},project)).toThrow();
  });
  it("reads safe metadata without exposing bucket keys or remote provider URLs",()=>{
    expect(readPrivateMediaPage({ok:true,items:[asset],nextCursor:null},project)).toEqual({items:[asset],nextCursor:null});
    expect(readPrivateMediaPage({ok:true,items:[],nextCursor:null},project)).toEqual({items:[],nextCursor:null});
  });
});
