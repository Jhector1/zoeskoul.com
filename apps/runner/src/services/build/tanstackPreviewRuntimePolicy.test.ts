import { describe, expect, it } from "vitest";
import { normalizeTanstackPreviewHttpRequest } from "./tanstackPreviewHttpBoundary.js";
import {
  TANSTACK_PREVIEW_DEV_COMMAND, isTanstackSsrReady, tanstackInternalPreviewPath,
  assertTanstackSandboxOptions,
} from "./tanstackPreviewRuntimePolicy.js";

const base = `/api/build/projects/project1/preview/preview1/content/${"x".repeat(32)}/`;
const response = {status:200, headers:{"content-type":"text/html; charset=utf-8"},
  bodyBase64:Buffer.from("<!doctype html><html><head></head><body>hello</body></html>").toString("base64")};

describe("TanStack isolated SSR preview policy", () => {
  it("validates exact capability before rewriting to app-local route", () => {
    const request = normalizeTanstackPreviewHttpRequest({basePath:base, path:base+"about?ref=1", method:"GET"});
    expect(tanstackInternalPreviewPath(base,request)).toBe("/about?ref=1");
    expect(tanstackInternalPreviewPath(base,normalizeTanstackPreviewHttpRequest({basePath:base,path:base,method:"GET"}))).toBe("/");
    expect(() => tanstackInternalPreviewPath(base.replace("x","y"),request)).toThrow();
  });
  it("rejects unsupported and malformed capability paths",()=>{
    const request = normalizeTanstackPreviewHttpRequest({basePath:base,path:base+"api/health",method:"GET"});
    expect(() => tanstackInternalPreviewPath("/api/build/projects/foo/content/",request)).toThrow();
    expect(() => normalizeTanstackPreviewHttpRequest({basePath:base,path:base+"%2e%2e/secrets",method:"GET"})).toThrow();
  });
  it("requires a real HTML document, not a successful JSON response", () => {
    expect(isTanstackSsrReady(response)).toBe(true);
    expect(isTanstackSsrReady({...response,status:404})).toBe(false);
    expect(isTanstackSsrReady({...response,headers:{"content-type":"application/json"}})).toBe(false);
  });
  it("rejects network escape, root, privileged execution and port publishing", () => {
    const options = { Cmd:TANSTACK_PREVIEW_DEV_COMMAND, User:"1000:1000",
      HostConfig:{ NetworkMode:"none",Privileged:false,ReadonlyRootfs:true,CpuPeriod:100000,CpuQuota:80000,CapDrop:["ALL"],Memory:1024*1024*1024,MemorySwap:1024*1024*1024,
        PidsLimit:128,Binds:["/isolated/workspace:/workspace:rw"],SecurityOpt:["no-new-privileges:true"] }};
    expect(() => assertTanstackSandboxOptions(options)).not.toThrow();
    expect(() => assertTanstackSandboxOptions({...options,HostConfig:{...options.HostConfig,NetworkMode:"bridge"}})).toThrow();
    expect(() => assertTanstackSandboxOptions({...options,User:"0:0",HostConfig:{...options.HostConfig,PortBindings:{"5173/tcp":[{}]}}})).toThrow();
    expect(() => assertTanstackSandboxOptions({...options,HostConfig:{...options.HostConfig,Binds:[...options.HostConfig.Binds,"/var/run/docker.sock:/var/run/docker.sock:rw"]}})).toThrow();
  });
});
