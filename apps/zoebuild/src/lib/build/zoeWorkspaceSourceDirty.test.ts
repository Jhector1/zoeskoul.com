import { describe, it, expect } from "vitest";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { hasUnsavedZoeWorkspaceSource } from "./zoeWorkspaceSourceDirty";

function workspace(content = "hello", activeFileId = "home", updatedAt = 1): WorkspaceStateV2 {
  return {
    version: 2, language: "html", activeFileId,
    nodes: [{id:"home",kind:"file",name:"index.html",parentId:null,
      content,createdAt:1,updatedAt}],
  } as unknown as WorkspaceStateV2;
}

describe("E17E source-only editor dirty guard", () => {
  it("ignores active file and timestamp-only workspace changes", () => {
    expect(hasUnsavedZoeWorkspaceSource(workspace(),workspace("hello","another",50))).toBe(false);
  });
  it("detects actual text edits", () => {
    expect(hasUnsavedZoeWorkspaceSource(workspace(),workspace("changed"))).toBe(true);
  });
  it("clears false dirtiness when source is restored", () => {
    const original=workspace();
    const changed=workspace("changed");
    expect(hasUnsavedZoeWorkspaceSource(original,changed)).toBe(true);
    expect(hasUnsavedZoeWorkspaceSource(original,workspace())).toBe(false);
  });
  it("detects added or removed source files", () => {
    const a=workspace();
    const b={...a,nodes:[...a.nodes,{...a.nodes[0],id:"other",name:"app.css",content:"body{}"}]};
    expect(hasUnsavedZoeWorkspaceSource(a,b)).toBe(true);
    expect(hasUnsavedZoeWorkspaceSource(b,a)).toBe(true);
  });
  it("detects empty folder creation and rename", () => {
    const a=workspace();
    const b={...a,nodes:[...a.nodes,{id:"f1",kind:"folder" as const,name:"styles",parentId:null,createdAt:1,updatedAt:1}]};
    const c={...b,nodes:b.nodes.map(node=>node.id==="f1"?{...node,name:"images"}:node)};
    expect(hasUnsavedZoeWorkspaceSource(a,b as WorkspaceStateV2)).toBe(true);
    expect(hasUnsavedZoeWorkspaceSource(b as WorkspaceStateV2,c as WorkspaceStateV2)).toBe(true);
  });
  it("detects file rename independent of content", () => {
    const a=workspace();
    const b={...a,nodes:a.nodes.map(node=>({...node,name:"home.html"}))};
    expect(hasUnsavedZoeWorkspaceSource(a,b)).toBe(true);
  });
});
