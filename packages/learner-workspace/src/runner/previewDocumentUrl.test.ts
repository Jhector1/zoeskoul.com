import { describe, expect, it } from "vitest";
import { previewDocumentRoute, withPreviewDocumentRevision } from "./previewDocumentUrl";
const BASE = "/api/build/projects/cmva2y8l2000221dl6w20b5cm/preview/preview_0d5524f1-b9b1-4165-a986-b40db0de774a/content/hc0yaQh_mkTxk3nnFA5FYsnNzaZwDPmP/";

describe("trusted React preview document gateway", () => {
  it("serves the same Vite root for any selected page", () => {
    const home = new URL(withPreviewDocumentRevision(BASE,0,"/"),"https://preview.invalid");
    expect(home.pathname).toBe(BASE+"__zoebuild/document");
    expect(home.searchParams.get("__zb_preview_route")).toBe("/");
    expect(home.searchParams.get("__zb_preview_revision")).toBe("0");
    expect(previewDocumentRoute(BASE,home.pathname)).toBe("/");
  });
  it("keeps nested pages, query and hash as inert route data", () => {
    const document = new URL(withPreviewDocumentRevision(BASE,3,"/approach?x=1#story"),"https://preview.invalid");
    expect(document.pathname).toBe(BASE+"__zoebuild/document");
    expect(document.searchParams.get("__zb_preview_route")).toBe("/approach?x=1#story");
    expect(document.searchParams.get("__zb_preview_revision")).toBe("3");
  });
  it("refuses external, traversal, malformed route and untrusted document roots", () => {
    for (const route of ["//evil/path","http://evil.test","/%2e%2e/a","/%2fetc","/a\\b","/?__zb_preview_revision=5"])
      expect(() => withPreviewDocumentRevision(BASE,0,route)).toThrow();
    expect(() => withPreviewDocumentRevision("/untrusted/",0,"/")).toThrow();
  });
});
