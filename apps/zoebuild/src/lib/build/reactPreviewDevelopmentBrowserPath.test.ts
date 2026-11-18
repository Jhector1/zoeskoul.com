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

describe("Phase 4F5H10I CSS URL-import flag restoration",()=>{
 it("preserves intended query for case 1",()=>{
  expect(check("/src/styles.css?url=")).toBe("src/styles.css?url");
 });
 it("preserves intended query for case 2",()=>{
  expect(check("/src/styles.css?url")).toBe("src/styles.css?url");
 });
 it("preserves intended query for case 3",()=>{
  expect(check("/src/styles.css?import=&url=")).toBe("src/styles.css?import&url");
 });
 it("preserves intended query for case 4",()=>{
  expect(check("/src/styles.css?url=&import=")).toBe("src/styles.css?url&import");
 });
 it("preserves intended query for case 5",()=>{
  expect(check("/src/styles.css?import&url=")).toBe("src/styles.css?import&url");
 });
 it("preserves intended query for case 6",()=>{
  expect(check("/src/styles.css?url=&t=123&v=abc")).toBe("src/styles.css?url&t=123&v=abc");
 });
 it("preserves intended query for case 7",()=>{
  expect(check("/src/styles.css?url=&other=a%26b%3D&empty=")).toBe("src/styles.css?url&other=a%26b%3D&empty=");
 });
 it("preserves intended query for case 8",()=>{
  expect(check("/node_modules/pkg/theme.css?url=")).toBe("node_modules/pkg/theme.css?url");
 });
 it("preserves intended query for case 9",()=>{
  expect(check("/src/styles.css?url=custom&import=")).toBe("src/styles.css?url=custom&import=");
 });
 it("preserves intended query for case 10",()=>{
  expect(check("/src/styles.css?URL=&import=")).toBe("src/styles.css?URL=&import=");
 });
 it("preserves intended query for case 11",()=>{
  expect(check("/src/styles.css?%75rl=&import=")).toBe("src/styles.css?%75rl=&import=");
 });
 it("preserves intended query for case 12",()=>{
  expect(check("/src/styles.css?direct=")).toBe("src/styles.css?direct=");
 });
 it("preserves intended query for case 13",()=>{
  expect(check("/src/styles.css?import=")).toBe("src/styles.css?import=");
 });
 it("preserves intended query for case 14",()=>{
  expect(check("/src/styles.css")).toBe("src/styles.css");
 });
 it("preserves intended query for case 15",()=>{
  expect(check("/about?url=&import=")).toBe("about?url=&import=");
 });
 it("preserves intended query for case 16",()=>{
  expect(check("/src/App.tsx?import=")).toBe("src/App.tsx?import=");
 });
 it("preserves intended query for case 17",()=>{
  expect(check("/src/styles.css?x=url%3D")).toBe("src/styles.css?x=url%3D");
 });
 it("preserves intended query for case 18",()=>{
  expect(check("/@tanstack-start/styles.css?routes=__root__%2C%2F")).toBe("@tanstack-start/styles.css?routes=__root__%2C%2F");
 });
 it("preserves intended query for case 19",()=>{
  expect(check("/src/styles.css?url=&x=&url=")).toBe("src/styles.css?url&x=&url");
 });
 it("restores flags only after strict path validation",()=>{
  for(const suffix of ["/src/%2fstyles.css?url=", "/@fs/styles.css?url=", "/src/%252e%252e/styles.css?url=", "/src/a//styles.css?url=", "/src/styles.css?url=#fragment", "/src/styles.css?url=&x="+"a".repeat(196)])
   expect(()=>check(suffix)).toThrow();
  expect(()=>normalizeDevelopmentPreviewBrowserPath(new URL(base+"/src/styles.css?url="),"project_other",preview,token)).toThrow();
 });
});
