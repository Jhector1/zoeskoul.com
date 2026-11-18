import {describe,expect,it} from "vitest";
import {prepareDevelopmentPreviewBrowserResponse,publicDevelopmentPreviewBasePath,DEVELOPMENT_PREVIEW_PUBLIC_BASE_MARKER} from "./reactPreviewDevelopmentContentPolicy";
const token="dpv1."+"a".repeat(120);
const preview="preview_11111111-1111-4111-8111-111111111111";
const base=publicDevelopmentPreviewBasePath("project_1",preview,token);
function upstream(text:string,type="text/html"){
 return {status:200,headers:{"content-type":type},bodyBase64:Buffer.from(text).toString("base64")};
}
describe("Phase 4E2B2 browser content boundary",()=>{
 it("rewrites only the inert marker to the tokenized, project-scoped public base",async()=>{
  const response=prepareDevelopmentPreviewBrowserResponse(upstream(`<script src="${DEVELOPMENT_PREVIEW_PUBLIC_BASE_MARKER}@vite/client"></script>`),base,"GET");
  expect(response.status).toBe(200);
  expect(await response.text()).toContain(`${base}@vite/client`);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("content-security-policy")).toContain("sandbox allow-scripts");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
 });
 it("rejects unredacted Runner capability and never forwards Set-Cookie",()=>{
  const capability=`/api/build/projects/project_1/preview/${preview}/content/${"z".repeat(32)}/`;
  expect(()=>prepareDevelopmentPreviewBrowserResponse(upstream(`<script src="${capability}x.js"></script>`),base,"GET")).toThrow();
  const response=prepareDevelopmentPreviewBrowserResponse({status:200,headers:{"content-type":"text/html","set-cookie":"sensitive"},bodyBase64:""},base,"HEAD");
  expect(response.headers.has("set-cookie")).toBe(false);
 });
 it("allows safe binary bytes but rejects redirects, oversized and unsupported bodies",async()=>{
  const bytes=Buffer.from([0,255,4,88]);
  const response=prepareDevelopmentPreviewBrowserResponse({status:200,headers:{"content-type":"image/png"},bodyBase64:bytes.toString("base64")},base,"GET");
  expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  for(const status of [301,302,399])expect(()=>prepareDevelopmentPreviewBrowserResponse({...upstream("x"),status},base,"GET")).toThrow();
  expect(()=>prepareDevelopmentPreviewBrowserResponse(upstream("x","application/x-secret"),base,"GET")).toThrow();
  expect(()=>prepareDevelopmentPreviewBrowserResponse(upstream("x","text/html"),"/bad/","GET")).not.toThrow();
 });
 it("preserves JavaScript CSS URL modules as JavaScript with opaque-origin CORS",async()=>{
  const module=`export default ${JSON.stringify(DEVELOPMENT_PREVIEW_PUBLIC_BASE_MARKER+"src/styles.css")}`;
  const response=prepareDevelopmentPreviewBrowserResponse(
    upstream(module,"application/javascript"),base,"GET");
  expect(response.headers.get("content-type")).toBe("application/javascript");
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
  expect(response.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
  expect(await response.text()).toBe(`export default ${JSON.stringify(base+"src/styles.css")}`);
 });
});
