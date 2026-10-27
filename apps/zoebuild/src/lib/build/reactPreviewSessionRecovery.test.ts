import { describe, expect, it } from "vitest";
import { classifyCachedPreviewDocument, previewViewerIdentity } from "./reactPreviewSessionRecovery";

describe("V12K11G preview session identity and liveness", () => {
  it("reuses one viewer across source revisions on one capability path", () => {
    const url = "/api/build/projects/p/preview/preview_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/content/aaaa/";
    expect(previewViewerIdentity("p", url)).toBe(previewViewerIdentity("p", url));
  });
  it("remounts the viewer on runner session replacement", () => {
    expect(previewViewerIdentity("p", "/content/old/")).not.toBe(previewViewerIdentity("p", "/content/new/"));
  });
  it("does not reuse a viewer across projects", () => {
    expect(previewViewerIdentity("p1", "/same/")).not.toBe(previewViewerIdentity("p2", "/same/"));
  });
  it("keeps loading identity separate from ready identity", () => {
    expect(previewViewerIdentity("p", null)).not.toBe(previewViewerIdentity("p", "/content/"));
  });
  it("accepts genuine HTML with an optional charset", () => {
    expect(classifyCachedPreviewDocument(200, "text/html; charset=utf-8")).toBe("ready");
    expect(classifyCachedPreviewDocument(200, "text/html")).toBe("ready");
  });
  it("starts a new session only after an explicit expiry signal", () => {
    expect(classifyCachedPreviewDocument(404, "text/html")).toBe("expired");
    expect(classifyCachedPreviewDocument(410, null)).toBe("expired");
  });
  it("does not treat auth, gateway, or malformed documents as expired", () => {
    for (const status of [400, 401, 403, 429, 500, 502, 503]) {
      expect(classifyCachedPreviewDocument(status, "text/html")).toBe("unavailable");
    }
    expect(classifyCachedPreviewDocument(200, "application/json")).toBe("unavailable");
    expect(classifyCachedPreviewDocument(204, null)).toBe("unavailable");
  });
  it("does not interpret string status or loose content types as valid HTML", () => {
    expect(classifyCachedPreviewDocument(200, "text/html+nothtml")).toBe("unavailable");
    expect(classifyCachedPreviewDocument(200, null)).toBe("unavailable");
  });
});
