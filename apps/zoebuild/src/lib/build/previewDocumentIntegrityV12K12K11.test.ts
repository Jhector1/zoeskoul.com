import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { previewDocumentGatewayUrl, classifyPreviewDocumentHealth } from "./previewDocumentIntegrity";
const root = process.cwd();
const read = (f:string) => readFileSync(path.resolve(root, f), "utf8");
const base = "/api/build/projects/project1/preview/preview_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/content/abcdefghijklmnopqrstuvwxyzABCDEF/";
describe("K11 preview document integrity", () => {
  it("probes the exact browser document gateway, never a raw runner index.html", () => {
    expect(previewDocumentGatewayUrl(base)).toBe(`${base}__zoebuild/document?__zb_preview_route=%2F&__zb_preview_revision=0`);
    expect(() => previewDocumentGatewayUrl("https://evil.example/")).toThrow();
    expect(() => previewDocumentGatewayUrl(base + "?foo=1")).toThrow();
  });
  it("never treats a 404, JSON envelope or a redirect as a ready document", () => {
    expect(classifyPreviewDocumentHealth(200,"text/html; charset=utf-8",null)).toBe("ready");
    expect(classifyPreviewDocumentHealth(404,"text/html","runner-root-404")).toBe("expired");
    expect(classifyPreviewDocumentHealth(404,"text/plain","runner-http-404")).toBe("expired");
    expect(classifyPreviewDocumentHealth(200,"application/json",null)).toBe("unavailable");
    expect(classifyPreviewDocumentHealth(302,"text/html",null)).toBe("unavailable");
  });
  it("verifies the runner capability before reporting a ready operation", () => {
    const start = read("src/app/api/build/projects/[buildProjectId]/preview/start/route.ts");
    const status = read("src/app/api/build/projects/[buildProjectId]/preview/operations/[operationId]/route.ts");
    expect(start).toContain("submitTrustedReactPreviewOperationAtRunner");
    expect(status).toContain("proxyFetchTrustedReactPreviewAtRunner");
    // Preparing operations return 200 without a document fetch. Only the
    // final READY branch must verify the capability and saved-source fence.
    expect(status).toContain('if (operation.state !== "ready" || !operation.preview)');
    expect(status).toContain("const afterDocument = await requireOwnedReactPreviewProject");
    expect(status).toContain("return json(requestId, {ok:true, operation}, 200)");
    const proxy = status.indexOf("proxyFetchTrustedReactPreviewAtRunner({");
    const sourceFence = status.indexOf("const afterDocument = await requireOwnedReactPreviewProject");
    const readyReturn = status.lastIndexOf("return json(requestId, {ok:true, operation}, 200)");
    expect(proxy).toBeGreaterThan(status.indexOf('if (operation.state !== "ready" || !operation.preview)'));
    expect(proxy).toBeLessThan(sourceFence);
    expect(sourceFence).toBeLessThan(readyReturn);
    expect(status).toContain("BUILD_PREVIEW_RUNNER_ROUTING");
  });
  it("hides cached preview until the document gateway is verified", () => {
    const hook = read("src/components/builder/useReactVitePreview.ts");
    expect(hook).toContain("previewDocumentGatewayUrl(cachedSession.basePath)");
    expect(hook).toContain("previewDocumentGatewayUrl(basePath)");
    expect(hook).toContain("src: null,\n        state: \"starting\"");
    expect(hook).toContain("await cancelPreviewSession(input.buildProjectId, unusable)");
  });
});
