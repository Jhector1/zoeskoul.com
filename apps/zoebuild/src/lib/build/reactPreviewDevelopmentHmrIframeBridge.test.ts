import { describe, it, expect } from "vitest";
import {safeViteIframeFrame, PUBLIC_BASE_MARKER} from "./reactPreviewDevelopmentHmrIframeBridge";
import {injectNativeIframeHmrBootstrap, ZOEBUILD_IFRAME_HMR_SCRIPT} from "./reactPreviewDevelopmentNativeIframeHmr";

const grant="/api/build/projects/project_a/preview/preview_123e4567-e89b-42d3-a456-426614174000/development/content/dpg1."+"a".repeat(43)+"/";
const privateBase="/api/build/projects/project_a/preview/preview_123e4567-e89b-42d3-a456-426614174000/content/"+"b".repeat(32)+"/";
describe("Phase 4E3C4B3 isolated iframe HMR transport",()=>{
  it("inserts bootstrap BEFORE Vite client imports without exposing any bearer",()=>{
    const original='<!doctype html><html><head><script type="module" src="'+grant+'@vite/client"></script></head><body>app</body></html>';
    const injected=injectNativeIframeHmrBootstrap(original);
    expect(injected.indexOf("__zoebuildHmrInstalled")).toBeLessThan(injected.indexOf("@vite/client"));
    expect(ZOEBUILD_IFRAME_HMR_SCRIPT).toContain('"vite-hmr"');
    expect(ZOEBUILD_IFRAME_HMR_SCRIPT).not.toContain("RUNNER_SHARED_SECRET");
  });
  it("fails closed without a safe head or with preexisting bootstrap",()=>{
    expect(()=>injectNativeIframeHmrBootstrap("<body>No head</body>")).toThrow();
    expect(()=>injectNativeIframeHmrBootstrap("<head>__zoebuildHmrInstalled</head>")).toThrow();
  });
  it("rewrites only the inert marker, not raw private Runner paths",()=>{
    const event=JSON.stringify({type:"update",updates:[{path:PUBLIC_BASE_MARKER+"src/index.tsx"}]});
    const message=safeViteIframeFrame(event,grant);
    expect(message).toContain(grant+"src/index.tsx");
    expect(message).not.toContain(PUBLIC_BASE_MARKER);
    expect(safeViteIframeFrame(JSON.stringify({type:"update",path:privateBase+"app"}),grant)).toBeNull();
  });
  it("rejects wrong identities, non-Vite messages, oversized and malformed frames",()=>{
    for(const raw of ['bad',JSON.stringify({type:"unexpected"}),"x".repeat(70000)])
      expect(safeViteIframeFrame(raw,grant)).toBeNull();
    expect(safeViteIframeFrame('{"type":"connected"}',"https://private.internal/")).toBeNull();
  });
});
