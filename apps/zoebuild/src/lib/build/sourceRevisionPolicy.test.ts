import {describe,expect,it} from "vitest";
import {buildRevisionFilePreview,parseRevisionRestoreRequest} from "./sourceRevisionPolicy";

describe("source revision restore contract", () => {
  it("requires exactly two safe integer versions with a prior target", () => {
    expect(parseRevisionRestoreRequest({baseVersion:4,restoreVersion:2})).toEqual({baseVersion:4,restoreVersion:2});
    for (const invalid of [null,[],{}, {baseVersion:4,restoreVersion:4},
      {baseVersion:3,restoreVersion:5},{baseVersion:3.3,restoreVersion:1},
      {baseVersion:3,restoreVersion:"1"},{baseVersion:3,restoreVersion:1,workspace:{}}])
      expect(parseRevisionRestoreRequest(invalid)).toBeNull();
  });
  it("excerpts safe source and excludes binaries, unrelated files and credentials", () => {
    const preview=buildRevisionFilePreview({nodes:[
      {id:"root",name:"src",kind:"folder"},
      {id:"app",parentId:"root",name:"App.tsx",kind:"file",content:"<h1>Forma</h1>"},
      {id:"header",parentId:"root",name:"secret.env",kind:"file",content:"password"},
      {id:"binary",parentId:"root",name:"icon.png",kind:"file",binary:true,content:"xxx"},
      {id:"folder",parentId:"root",name:"components",kind:"folder"},
      {id:"n",parentId:"folder",name:"Nav.tsx",kind:"file",content:"<nav>Site</nav>"},
      {id:"secret",parentId:"folder",name:"Api.tsx",kind:"file",content:["sk", "live", "synthetic_fixture_not_a_real_key"].join("_")},
    ]});
    expect(preview.files.map(f=>f.path)).toEqual(["src/App.tsx","src/components/Nav.tsx"]);
    expect(preview.omitted).toBe(2);
  });
  it("excludes real workspace binary payloads even when a file has an allowed source extension", () => {
    const preview=buildRevisionFilePreview({nodes:[
      {id:"src",name:"src",kind:"folder"},
      {id:"ok",parentId:"src",name:"App.tsx",kind:"file",content:"<h1>Safe</h1>"},
      {id:"b",parentId:"src",name:"Other.tsx",kind:"file",
        binary:{mimeType:"application/octet-stream",base64:"not-really-binary"},
        content:"PRIVATE_BINARY_CONTENT"},
    ]});
    expect(preview.files.map(file => file.path)).toEqual(["src/App.tsx"]);
    expect(JSON.stringify(preview)).not.toContain("PRIVATE_BINARY_CONTENT");
  });
  it("bounds a file preview instead of returning entire snapshots", () => {
    const preview=buildRevisionFilePreview({nodes:[
      {id:"app",name:"App.tsx",parentId:"src",kind:"file",content:"a".repeat(50_000)},
      {id:"src",name:"src",kind:"folder"},
    ]});
    expect(preview.files[0]?.content.length).toBe(6000);
    expect(preview.files[0]?.truncated).toBe(true);
  });
});
