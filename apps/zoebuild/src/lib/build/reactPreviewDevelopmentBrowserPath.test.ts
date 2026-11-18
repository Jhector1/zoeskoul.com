import {describe,expect,it} from "vitest";
import {normalizeDevelopmentPreviewBrowserPath} from "./reactPreviewDevelopmentBrowserPath";
const project="project_1",preview="preview_11111111-1111-4111-8111-111111111111",token="dpv1."+"a".repeat(110);
const base=`https://app.example/api/build/projects/${project}/preview/${preview}/development/content/${token}`;
const check=(path:string)=>normalizeDevelopmentPreviewBrowserPath(new URL(base+path),project,preview,token);
describe("Phase 4E2B2 strict browser URL parse",()=>{
 it("accepts only relative safe app paths",()=>{
  expect(check("")).toBe("");
  expect(check("/")).toBe("");
  expect(check("/@vite/client?x=1")).toBe("@vite/client?x=1");
  expect(check("/src/App.tsx?import")).toBe("src/App.tsx?import");
  expect(check("/@id/virtual:tanstack-start-dev-client-entry"))
    .toBe("@id/virtual:tanstack-start-dev-client-entry");
  expect(check("/src/styles.css?url")).toBe("src/styles.css?url");
 });
 it("rejects encoded traversal, separators, double decoding and other projects",()=>{
  for(const path of ["/%2e%2e/private","/a/%252e%252e", "/a/%2f/b","/a/%5c/b", "/x//y", "/x//y/", "/@fs/etc/passwd", "/http:%2f%2fother", "/src/http:evil", "/@id/virtual:bad%20id", "/@id/virtual:unrelated-plugin", "/other/virtual:module"])
   expect(()=>check(path)).toThrow();
  expect(()=>normalizeDevelopmentPreviewBrowserPath(new URL(base+"/file.js"),"project_other",preview,token)).toThrow();
 });
});
