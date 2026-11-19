import { describe, expect, it } from "vitest";
import {
  normalizeTanstackPreviewHttpRequest, normalizeTanstackPreviewHttpResponse,
  TANSTACK_PREVIEW_MAX_REQUEST_BYTES, TANSTACK_PREVIEW_MAX_RESPONSE_BYTES,
} from "./tanstackPreviewHttpBoundary";

const basePath = `/api/build/projects/proj_1/preview/preview_1/content/${"x".repeat(32)}/`;
const request = (overrides: Record<string, unknown> = {}) => normalizeTanstackPreviewHttpRequest({
  basePath, path: `${basePath}api/actions?key=value`, method: "POST", ...overrides,
});

describe("TanStack full-stack HTTP preview security boundary", () => {
  it("permits bounded POST server functions without forwarding browser authority", () => {
    const result = request({ bodyBase64: Buffer.from('{"hello":true}').toString("base64"),
      headers: { accept: "application/json", "content-type": "application/json",
        cookie: "zoebuild-session=secret", authorization: "Bearer secret", host: "private.internal",
        origin: "https://platform.example", "x-forwarded-host": "private.internal" } });
    expect(result.method).toBe("POST");
    expect(result.headers).toEqual({ accept: "application/json", "content-type": "application/json" });
  });
  it("limits methods and rejects GET or HEAD bodies", () => {
    expect(() => request({ method: "DELETE" })).toThrow();
    expect(() => request({ method: "GET", bodyBase64: "YWJj" })).toThrow();
    expect(() => request({ method: "HEAD", bodyBase64: "YWJj" })).toThrow();
    expect(request({method: "GET"}).method).toBe("GET");
  });
  it("requires the exact capability path and rejects route confusion", () => {
    for (const path of ["http://127.0.0.1:5173/", "//evil.invalid/", basePath.slice(0,-1) + "-other/",
      `${basePath}../private`, `${basePath}%2e%2e/private`, `${basePath}%2Fprivate`,
      `${basePath}abc%5cdef`, `${basePath}foo#bar`, `${basePath}foo\r\nX: x`])
      expect(() => request({ path })).toThrow();
    expect(() => request({ basePath: "/" })).toThrow();
  });
  it("enforces the request limit and rejects malformed base64", () => {
    expect(request({bodyBase64:Buffer.alloc(TANSTACK_PREVIEW_MAX_REQUEST_BYTES).toString("base64")}).bodyBase64).toBeTruthy();
    expect(() => request({bodyBase64:Buffer.alloc(TANSTACK_PREVIEW_MAX_REQUEST_BYTES+1).toString("base64")})).toThrow();
    expect(() => request({bodyBase64:"!!"})).toThrow();
  });
  it("rejects header injection and unsupported content types", () => {
    expect(() => request({ headers: {"content-type":"application/json\r\nx-hack: true"} })).toThrow();
    expect(() => request({ headers: {"content-type":"text/html"} })).toThrow();
    expect(request({headers:{accept:"x\r\ny"}}).headers.accept).toBe("*/*");
  });
  it("strips cookies, redirects, caching claims and internal response headers", () => {
    const result = normalizeTanstackPreviewHttpResponse({status:200, bodyBase64:Buffer.from("ok").toString("base64"),
      headers:{"content-type":"text/html", "set-cookie":"token=bad", location:"https://evil.invalid",
        "cache-control":"public, max-age=100000", "access-control-allow-origin":"*"}});
    expect(result.headers).toEqual({"content-type":"text/html", "cache-control":"no-store"});
    expect(() => normalizeTanstackPreviewHttpResponse({status:302,headers:{location:"https://evil.invalid"},bodyBase64:""})).toThrow();
  });
  it("preserves the bounded document, stylesheet, and JavaScript MIME contracts", () => {
    for (const contentType of [
      "text/html; charset=utf-8",
      "text/css; charset=utf-8",
      "application/javascript; charset=utf-8",
    ]) {
      expect(normalizeTanstackPreviewHttpResponse({
        status:200,headers:{"content-type":contentType},bodyBase64:"",
      }).headers["content-type"]).toBe(contentType);
    }
  });
  it("accepts only a bounded numeric Vite duration and strips timing labels", () => {
    expect(normalizeTanstackPreviewHttpResponse({status:200,headers:{},bodyBase64:"",
      upstreamDurationMs:12.34,internalAddress:"127.0.0.1:5173",capability:"secret"}))
      .toMatchObject({upstreamDurationMs:12.3});
    expect(normalizeTanstackPreviewHttpResponse({status:200,headers:{},bodyBase64:"",
      upstreamDurationMs:Number.POSITIVE_INFINITY}).upstreamDurationMs).toBeNull();
    expect(normalizeTanstackPreviewHttpResponse({status:200,headers:{},bodyBase64:"",
      upstreamDurationMs:20_001}).upstreamDurationMs).toBeNull();
  });
  it("limits response bytes", () => {
    expect(() => normalizeTanstackPreviewHttpResponse({status:200, headers:{},
      bodyBase64:Buffer.alloc(TANSTACK_PREVIEW_MAX_RESPONSE_BYTES+1).toString("base64")})).toThrow();
  });
});


describe("explicit internal JSON GET RPC protocol",()=>{
 const base="/api/build/projects/project/preview/preview_12345678-1234-4123-8123-123456789abc/content/"+"a".repeat(32)+"/";
 const id=(file:string)=>Buffer.from(JSON.stringify({file,export:"getSiteInfo_createServerFn_handler"})).toString("base64url");
 const url=base+"_serverFn/"+id("/src/functions/siteInfo.functions.ts?tss-serverfn-split");
 it("constructs the explicit bounded mode without browser Origin",()=>{
  const result=normalizeTanstackPreviewHttpRequest({basePath:base,path:url,method:"GET",headers:{accept:"*/*"},applicationRpc:"tanstack-json-get-v1"});
  expect(result).toMatchObject({applicationRpc:"tanstack-json-get-v1",headers:{accept:"application/x-tss-framed, application/x-ndjson, application/json"},bodyBase64:""});
 });
 it("rejects traversal, arbitrary paths, duplicate queries and browser headers",()=>{
  for(const path of [base+"src/index.tsx",base+"_serverFn/"+id("/src/../secret.ts?tss-serverfn-split"),url+"?payload=%7B%7D&payload=%7B%7D"])
   expect(()=>normalizeTanstackPreviewHttpRequest({basePath:base,path,method:"GET",applicationRpc:"tanstack-json-get-v1"})).toThrow();
  expect(()=>normalizeTanstackPreviewHttpRequest({basePath:base,path:url,method:"GET",headers:{origin:"null"},applicationRpc:"tanstack-json-get-v1"})).toThrow();
 });
 it("preserves serialized JSON metadata only for this exact mode",()=>{
  const bodyBase64=Buffer.from('{"value":1}').toString("base64");
  const reply={status:200,headers:{"content-type":"application/json","x-tss-serialized":"true","set-cookie":"bad"},bodyBase64};
  expect(normalizeTanstackPreviewHttpResponse(reply,"tanstack-json-get-v1").headers).toEqual({"content-type":"application/json","cache-control":"no-store","x-tss-serialized":"true"});
  expect(normalizeTanstackPreviewHttpResponse(reply).headers).not.toHaveProperty("x-tss-serialized");
  expect(()=>normalizeTanstackPreviewHttpResponse({...reply,headers:{...reply.headers,"content-type":"application/x-tss-framed; v=1"}},"tanstack-json-get-v1")).toThrow();
 });
});


describe("H10P3A finite JSON mutation transport",()=>{
 const basePath="/api/build/projects/project/preview/preview_123e4567-e89b-42d3-a456-426614174000/content/"+"C".repeat(32)+"/";
 const id=Buffer.from(JSON.stringify({file:"/src/functions/mutate.ts?tss-serverfn-split",export:"mutate_handler"})).toString("base64url");
 const request=()=>({basePath,path:basePath+"_serverFn/"+id,method:"POST",headers:{accept:"*/*","content-type":"application/json"},bodyBase64:"e30=",applicationRpc:"tanstack-json-post-v1",mutationDeadlineMs:Date.now()+10_000});
 it("preserves only the exact bounded JSON mutation protocol",()=>{
  const input=request();expect(normalizeTanstackPreviewHttpRequest(input)).toMatchObject({method:"POST",applicationRpc:"tanstack-json-post-v1",bodyBase64:"e30=",mutationDeadlineMs:input.mutationDeadlineMs});
  for(const over of [{method:"GET"},{path:input.path+"?payload=e30="},{bodyBase64:""},{bodyBase64:"YWJj"},{mutationDeadlineMs:Date.now()-100},{headers:{...input.headers,origin:"null"}},{applicationRpc:"tanstack-json-get-v1"}])
   expect(()=>normalizeTanstackPreviewHttpRequest({...input,...over})).toThrow();
 });
});
