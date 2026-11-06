import { describe,expect,it } from "vitest";
import { previewWorkspaceMatchesSavedSource } from "./previewSourceIdentity";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";

function workspace(content:string,language:WorkspaceStateV2["language"]="html"):WorkspaceStateV2 {
  return {version:2,language,nodes:[{id:"file",kind:"file",name:"main.ts",parentId:null,
    content,createdAt:1,updatedAt:1}]} as unknown as WorkspaceStateV2;
}

describe("preview saved-source identity",()=>{
  it("accepts exact saved bytes independent of object identity",()=>{
    expect(previewWorkspaceMatchesSavedSource(workspace("export {}"),workspace("export {}"))).toBe(true);
  });
  it("rejects changed bytes or language under the same numeric source token",()=>{
    expect(previewWorkspaceMatchesSavedSource(workspace("one"),workspace("two"))).toBe(false);
    expect(previewWorkspaceMatchesSavedSource(workspace("one","html"),workspace("one","python"))).toBe(false);
  });
});
