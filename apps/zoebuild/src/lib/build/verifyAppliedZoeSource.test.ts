import { describe, expect, it } from "vitest";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { verifyAppliedZoeSource } from "./verifyAppliedZoeSource";
import type { ZoeSourceEditProposal } from "./zoeTargetedSourceEdit";

const snapshot = (files: Record<string,string>) => ({
  version: 2, language: "html", activeFileId: "0",
  nodes: Object.entries(files).map(([name,content],i) => ({
    kind:"file",name,content,id:String(i),parentId:null,createdAt:1,updatedAt:2,
  })),
} as unknown as WorkspaceStateV2);
const proposed = (path:string,content:string) => ([{
  path,content,beforeSha256:"0".repeat(64),beforePreview:"",afterPreview:content,
}] as ZoeSourceEditProposal["edits"]);

describe("E17F saved project content verification", () => {
  it("confirms exact approved file bytes after an authenticated versioned reload", () => {
    expect(verifyAppliedZoeSource(snapshot({"index.html":"<h1>New</h1>"}),
      proposed("index.html","<h1>New</h1>"))).toEqual(["index.html"]);
  });
  it("rejects a new source version that still contains the old file content", () => {
    expect(() => verifyAppliedZoeSource(snapshot({"index.html":"<h1>Old</h1>"}),
      proposed("index.html","<h1>New</h1>"))).toThrow("APPLIED_EDIT_SNAPSHOT_MISMATCH");
  });
  it("rejects a successful version whose approved new page is absent", () => {
    expect(() => verifyAppliedZoeSource(snapshot({"index.html":"Home"}),
      proposed("privacy.html","<h1>Privacy</h1>"))).toThrow("APPLIED_EDIT_SNAPSHOT_MISMATCH");
  });
  it("verifies every file in a multi-file proposal", () => {
    const edits = [...proposed("index.html","Home"),...proposed("styles.css","new")];
    expect(() => verifyAppliedZoeSource(snapshot({"index.html":"Home","styles.css":"old"}),edits))
      .toThrow("APPLIED_EDIT_SNAPSHOT_MISMATCH");
  });
  it("verifies all four React-route files, rather than rejecting a successful save", () => {
    const names = ["src/pages/approach.tsx", "src/App.tsx", "src/ZoePages.tsx", "src/main.tsx"];
    const files = Object.fromEntries(names.map((name,i)=>[name,`source-${i}`]));
    const edits = names.flatMap((name,i)=>proposed(name,`source-${i}`));
    expect(verifyAppliedZoeSource(snapshot(files),edits)).toEqual(names);
    const stale = {...files,"src/ZoePages.tsx":"old-router"};
    expect(()=>verifyAppliedZoeSource(snapshot(stale),edits)).toThrow("APPLIED_EDIT_SNAPSHOT_MISMATCH");
    expect(()=>verifyAppliedZoeSource(snapshot(files),[...edits,...proposed("extra.tsx","extra"),...proposed("sixth.tsx","sixth")]))
      .toThrow("APPLIED_EDIT_EVIDENCE_INVALID");
  });
  it("refuses duplicate paths and empty proposals", () => {
    const edit = proposed("index.html","new");
    expect(() => verifyAppliedZoeSource(snapshot({"index.html":"new"}),[])).toThrow("APPLIED_EDIT_EVIDENCE_INVALID");
    expect(() => verifyAppliedZoeSource(snapshot({"index.html":"new"}),[...edit,...edit]))
      .toThrow("APPLIED_EDIT_EVIDENCE_INVALID");
  });
});
