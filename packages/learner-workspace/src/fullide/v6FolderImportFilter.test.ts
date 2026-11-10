import {describe,it,expect} from "vitest";
import {shouldSkipV6FolderImportPath as skip} from "./v6FolderImportFilter";
describe("V6 folder import exclusions",()=>{
  it("excludes generated dependency trees",()=>{
    expect(skip("project/node_modules/lib/index.js")).toBe(true);
    expect(skip("project/.venv/lib/site.py")).toBe(true);
    expect(skip("project/__pycache__/a.pyc")).toBe(true);
  });
  it("excludes secret and internal files",()=>{
    expect(skip("project/.env.local")).toBe(true);
    expect(skip("project/.git/config")).toBe(true);
    expect(skip("project/.zoeskoul/config.json")).toBe(true);
  });
  it("excludes Finder metadata",()=>{
    expect(skip("project/.DS_Store")).toBe(true);
  });
  it("keeps actual README and source files",()=>{
    expect(skip("project/README.md")).toBe(false);
    expect(skip("project/docs/lesson.md")).toBe(false);
    expect(skip("project/src/main.py")).toBe(false);
    expect(skip("project/.keep")).toBe(false);
  });
});
