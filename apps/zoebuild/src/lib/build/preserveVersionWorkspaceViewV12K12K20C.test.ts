import {describe,it,expect} from "vitest";
import {preserveVersionWorkspaceView} from "./preserveVersionWorkspaceView";
import type {WorkspaceStateV2} from "@zoeskoul/learner-workspace/ide/types";
function ws(id:string,content:string):WorkspaceStateV2 {
  return {version:2,language:"web",nodes:[
    {id:`root-${id}`,name:"src",kind:"folder",parentId:null},
    {id:`file-${id}`,name:"App.tsx",kind:"file",parentId:`root-${id}`,content},
  ],openTabs:[`file-${id}`],activeFileId:`file-${id}`,entryFileId:`file-${id}`,
   leftPct:25} as WorkspaceStateV2;
}
describe("K20C presentation-only state preservation",()=>{
 it("retains selected path across different node IDs, but not old file bytes",()=>{
   const prev=ws("v1","old secret source"),next=ws("v16","new version code");
   // The target view and original fixture must stay unchanged; only the returned view inherits 66%.
   const target={...next,leftPct:41};
   const result=preserveVersionWorkspaceView(target, {...prev,leftPct:66});
   expect(result.activeFileId).toBe("file-v16");
   expect(result.openTabs).toEqual(["file-v16"]);
   expect(result.leftPct).toBe(66);
   expect(JSON.stringify(result)).not.toContain("old secret source");
   expect(target.leftPct).toBe(41);
   expect(next.leftPct).toBe(25);
 });
 it("does not retain a removed file or invent a nullable activeFileId",()=>{
   const base=ws("v16","new version code");
   // V1's src/App.tsx is absent. V16 instead has src/Dashboard.tsx.
   // Its activeFileId is stale, so use V16's real entry file as fallback.
   const target={...base,nodes:base.nodes.map(node=>node.kind==="file"
     ? {...node,name:"Dashboard.tsx"} : node),openTabs:[],activeFileId:"deleted-target-id"};
   const result=preserveVersionWorkspaceView(target,ws("v1","old secret source"));
   expect(result.activeFileId).toBe("file-v16");
   expect(result.openTabs).toEqual(["file-v16"]);
   expect(result.nodes.find(node=>node.kind==="file")?.name).toBe("Dashboard.tsx");
   expect(JSON.stringify(result)).not.toContain("old secret source");
   expect(target.openTabs).toEqual([]);
 });
 it("never creates phantom tabs when the target has no files",()=>{
   const base=ws("v16","new");
   // An empty file list is not a normal editor snapshot, but the helper must
   // remain type-safe and avoid copying previous version IDs if given one.
   const target={...base,nodes:[],openTabs:[]};
   const result=preserveVersionWorkspaceView(target,ws("v1","old"));
   expect(result.openTabs).toEqual([]);
   expect(result.activeFileId).toBe(target.activeFileId);
 });
});
