import { describe, expect, it } from "vitest";
import { normalizeTanstackPreviewHttpRequest } from "./tanstackPreviewHttpBoundary.js";
import {
  TANSTACK_PREVIEW_DEV_COMMAND, tanstackPreviewDevCommand, isTanstackSsrReady, tanstackInternalPreviewPath,
  assertTanstackSandboxOptions,
} from "./tanstackPreviewRuntimePolicy.js";

const base = `/api/build/projects/project1/preview/preview1/content/${"x".repeat(32)}/`;
const response = {status:200, headers:{"content-type":"text/html; charset=utf-8"},
  bodyBase64:Buffer.from("<!doctype html><html><head></head><body>hello</body></html>").toString("base64")};

describe("TanStack isolated SSR preview policy", () => {
  it("preserves a stylesheet Accept preference through the isolated transport", () => {
    const css = normalizeTanstackPreviewHttpRequest({
      basePath: base, path: base + "src/styles.css?direct", method: "GET",
      headers: { accept: "text/css" },
    });
    expect(css.headers).toEqual({ accept: "text/css" });
    expect(tanstackInternalPreviewPath(base, css)).toBe(base + "src/styles.css?direct");
    expect(normalizeTanstackPreviewHttpRequest({
      basePath: base, path: base + "src/styles.css", method: "GET",
    }).headers.accept).toBe("*/*");
  });

  it("retains the capability prefix for Vite's per-preview base middleware", () => {
    const request = normalizeTanstackPreviewHttpRequest({basePath:base, path:base+"about?ref=1", method:"GET"});
    expect(tanstackInternalPreviewPath(base,request)).toBe(base + "about?ref=1");
    expect(tanstackInternalPreviewPath(base,normalizeTanstackPreviewHttpRequest({basePath:base,path:base,method:"GET"}))).toBe(base);
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
    const mintBase = `/api/build/projects/project1/preview/preview_11111111-1111-1111-1111-111111111111/content/${"x".repeat(32)}/`;
    const command = tanstackPreviewDevCommand(mintBase);
    expect(command).toEqual([...TANSTACK_PREVIEW_DEV_COMMAND, "--base", mintBase]);
    const options = { Cmd:command, Env:[`ZOEBUILD_PREVIEW_BASE_PATH=${mintBase}`], User:"1000:1000",
      HostConfig:{ NetworkMode:"none",Privileged:false,ReadonlyRootfs:true,CpuPeriod:100000,CpuQuota:80000,CapDrop:["ALL"],Memory:1024*1024*1024,MemorySwap:1024*1024*1024,
        PidsLimit:128,Binds:["/isolated/workspace:/workspace:rw"],SecurityOpt:["no-new-privileges:true"] }};
    expect(() => assertTanstackSandboxOptions(options)).not.toThrow();
    expect(() => tanstackPreviewDevCommand("/evil/")).toThrow();
    expect(() => assertTanstackSandboxOptions({...options, Cmd:[...command.slice(0,-1), "/evil/"]})).toThrow();
    expect(() => assertTanstackSandboxOptions({...options, Env:[]})).toThrow();
    expect(() => assertTanstackSandboxOptions({...options, Env:[...options.Env, `ZOEBUILD_PREVIEW_BASE_PATH=${mintBase}`]})).toThrow();
    expect(() => assertTanstackSandboxOptions({...options,HostConfig:{...options.HostConfig,NetworkMode:"bridge"}})).toThrow();
    expect(() => assertTanstackSandboxOptions({...options,User:"0:0",HostConfig:{...options.HostConfig,PortBindings:{"5173/tcp":[{}]}}})).toThrow();
    expect(() => assertTanstackSandboxOptions({...options,HostConfig:{...options.HostConfig,Binds:[...options.HostConfig.Binds,"/var/run/docker.sock:/var/run/docker.sock:rw"]}})).toThrow();

    const layer = `/workspaces/.zoebuild-preview-dependency-layers-v1/${"a".repeat(64)}/node_modules:/workspace/node_modules:ro`;
    const cached = {...options, HostConfig:{...options.HostConfig,
      Binds:[...options.HostConfig.Binds,layer],Tmpfs:{
        "/workspace/node_modules/.vite":"rw,noexec,nosuid,nodev,size=64m,uid=1000,gid=1000,mode=0700",
        "/workspace/node_modules/.vite-temp":"rw,noexec,nosuid,nodev,size=16m,uid=1000,gid=1000,mode=0700",
      }}};
    expect(() => assertTanstackSandboxOptions(cached)).not.toThrow();
    expect(() => assertTanstackSandboxOptions({...cached,HostConfig:{...cached.HostConfig,
      Binds:[cached.HostConfig.Binds[0],layer.replace(":ro",":rw")]}})).toThrow();
    expect(() => assertTanstackSandboxOptions({...cached,HostConfig:{...cached.HostConfig,
      Tmpfs:{...cached.HostConfig.Tmpfs,"/workspace/node_modules/.vite":"rw,size=1g"}}})).toThrow();
  });
});
