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
