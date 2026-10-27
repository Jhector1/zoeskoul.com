import { describe, expect, it } from "vitest";
import { previewDocumentProxyTarget, resolvePreviewDocumentProxyPath } from "./reactPreviewDocumentProxyTarget";

const ROOT = "/api/build/projects/p/preview/preview_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/content/AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPp/";

describe("V12K11I exact preview document gateway", () => {
  it("routes the synthetic document URL to the verified capability root", () => {
    expect(previewDocumentProxyTarget(ROOT + "__zoebuild/document", ROOT)).toEqual({
      normalizedInput: ROOT,
      isDocumentGateway: true,
    });
  });
  it("retains all ordinary Vite paths for the existing strict normalizer", () => {
    for (const path of [ROOT, ROOT + "index.html", ROOT + "src/main.tsx", ROOT + "__zoebuild/navigation.js"]) {
      expect(previewDocumentProxyTarget(path, ROOT)).toEqual({
        normalizedInput: path,
        isDocumentGateway: false,
      });
    }
  });
  it("does not bypass normalization for lookalikes or malformed paths", () => {
    for (const path of [
      ROOT + "__zoebuild/document/",
      ROOT + "__zoebuild/document/../secret",
      ROOT + "__zoebuild/document%2F",
      ROOT + "__zoebuild/document.js",
      ROOT.slice(0, -1) + "__zoebuild/document",
      "/api/build/projects/other/" + ROOT.split("/").slice(4).join("/") + "__zoebuild/document",
      "https://evil.example/" + ROOT + "__zoebuild/document",
    ]) {
      expect(previewDocumentProxyTarget(path, ROOT)).toEqual({
        normalizedInput: path,
        isDocumentGateway: false,
      });
    }
  });
  it("never broadens one capability's synthetic path to another", () => {
    const other = ROOT.replace("AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPp", "PpOoNnMmLlKkJjIiHhGgFfEeDdCcBbAa");
    expect(previewDocumentProxyTarget(ROOT + "__zoebuild/document", other).isDocumentGateway).toBe(false);
  });
});


describe("V12K11J exact root normalization boundary", () => {
  it("resolves the exact synthetic document without running the asset normalizer", () => {
    const target = previewDocumentProxyTarget(ROOT + "__zoebuild/document", ROOT);
    const normalize = () => { throw new Error("asset normalizer must not run for a document root"); };
    expect(resolvePreviewDocumentProxyPath({ target, basePath: ROOT, normalize })).toBe(ROOT);
  });
  it("runs the strict asset normalizer for real Vite assets and lookalikes", () => {
    const requested: string[] = [];
    const normalize = ({pathname}: Readonly<{pathname:string;basePath:string}>) => {
      requested.push(pathname);
      return pathname.endsWith("document/") ? null : pathname;
    };
    for (const path of [ROOT + "src/main.tsx", ROOT + "__zoebuild/navigation.js", ROOT + "__zoebuild/document/"]) {
      const target = previewDocumentProxyTarget(path, ROOT);
      const normalized = resolvePreviewDocumentProxyPath({target,basePath:ROOT,normalize});
      expect(normalized).toBe(path.endsWith("document/") ? null : path);
    }
    expect(requested).toEqual([ROOT + "src/main.tsx", ROOT + "__zoebuild/navigation.js", ROOT + "__zoebuild/document/"]);
  });
  it("rejects a mismatched capability gateway through the strict normalizer", () => {
    const otherRoot = ROOT.replace("AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPp", "PpOoNnMmLlKkJjIiHhGgFfEeDdCcBbAa");
    const target = previewDocumentProxyTarget(ROOT + "__zoebuild/document", otherRoot);
    expect(target.isDocumentGateway).toBe(false);
    const normalize = () => null;
    expect(resolvePreviewDocumentProxyPath({ target, basePath: otherRoot, normalize })).toBeNull();
  });
});
