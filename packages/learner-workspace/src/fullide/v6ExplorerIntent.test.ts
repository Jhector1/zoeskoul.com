import { describe, expect, it } from "vitest";
import type { FSNode } from "@zoeskoul/learner-workspace/ide/types";
import { planV6InlineIntent, planV6MoveIntent, planV6DeleteIntent } from "./v6ExplorerIntent";

const nodes = [
  {id: "src", name: "src", parentId: null, kind: "folder"},
  {id: "main", name: "main.py", parentId: "src", kind: "file", content: "print(1)"},
  {id: "image", name: "image.png", parentId: "src", kind: "file", binary: {encoding: "base64", data: "AA=="}},
  {id: "docs", name: "docs", parentId: "src", kind: "folder"},
  {id: "other", name: "other", parentId: null, kind: "folder"},
] as FSNode[];

describe("V6B4e4d server-first explorer intent planning", () => {
  it("creates one folder without mutating the tree", () => {
    const before = JSON.stringify(nodes);
    expect(planV6InlineIntent(nodes, {mode:"new-folder",parentId:"src",value:"assets"}))
      .toEqual({kind:"mkdir",path:"src/assets"});
    expect(JSON.stringify(nodes)).toBe(before);
  });
  it("renames a text file using an atomic move intent", () => {
    expect(planV6InlineIntent(nodes, {mode:"rename",parentId:"src",targetId:"main",value:"new.py"}))
      .toEqual({kind:"move_file",path:"src/main.py",destinationPath:"src/new.py"});
  });
  it("renames nonempty folders via revision-protected move", () => {
    expect(planV6InlineIntent(nodes, {mode:"rename",parentId:"src",targetId:"docs",value:"manual"}))
      .toEqual({kind:"move_directory",path:"src/docs",destinationPath:"src/manual"});
  });
  it("does not create an intent for unchanged names", () => {
    expect(planV6InlineIntent(nodes, {mode:"rename",parentId:"src",targetId:"main",value:"main.py"})).toBeNull();
  });
  it("leaves new-file creation to the CAS file writer", () => {
    expect(planV6InlineIntent(nodes, {mode:"new-file",parentId:"src",value:"new.py"})).toBeNull();
  });
  it("moves a file to an explicitly existing folder", () => {
    expect(planV6MoveIntent(nodes,"main","other"))
      .toEqual({kind:"move_file",path:"src/main.py",destinationPath:"other/main.py"});
  });
  it("cannot move a folder into its own subtree", () => {
    expect(() => planV6MoveIntent(nodes,"src","docs")).toThrow();
  });
  it("blocks name collisions, including case-insensitive collisions", () => {
    expect(() => planV6InlineIntent(nodes,{mode:"new-folder",parentId:"src",value:"DOCS"})).toThrow();
  });
  it("blocks traversal and implicit multi-folder creation", () => {
    expect(() => planV6InlineIntent(nodes,{mode:"new-folder",parentId:"src",value:"../out"})).toThrow();
    expect(() => planV6InlineIntent(nodes,{mode:"new-folder",parentId:"src",value:"a/b"})).toThrow();
  });
  it("does not change a text file into a binary extension", () => {
    expect(() => planV6InlineIntent(nodes,{mode:"rename",parentId:"src",targetId:"main",value:"main.png"})).toThrow();
  });
  it("file deletes use CAS; folder deletes are recoverable", () => {
    expect(planV6DeleteIntent(nodes,"main")).toEqual({kind:"delete_file",path:"src/main.py"});
    expect(planV6DeleteIntent(nodes,"docs")).toEqual({kind:"trash_directory",path:"src/docs"});
  });
  it("unknown nodes must fail closed rather than mutate", () => {
    expect(() => planV6DeleteIntent(nodes,"missing")).toThrow();
  });
});
