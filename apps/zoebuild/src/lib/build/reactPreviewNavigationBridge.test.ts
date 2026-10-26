import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { injectReactPreviewNavigationBridge, PREVIEW_NAV_CHANNEL, PREVIEW_NAV_SCRIPT } from "./reactPreviewNavigationBridge";

const BASE = "/api/build/projects/preview-fixture/preview/preview_11111111-1111-1111-1111-111111111111/content/ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef/";

describe("opaque React preview navigation bridge", () => {
  it("injects before Vite scripts once and embeds only the authorized preview root", () => {
    const html = '<!doctype html><html><head><script type="module" src="/src/main.tsx"></script></head><body></body></html>';
    const built = injectReactPreviewNavigationBridge(html, BASE);
    expect(PREVIEW_NAV_SCRIPT).toContain(PREVIEW_NAV_CHANNEL);
    expect(built).toContain(`src="${BASE}__zoebuild/navigation.js"`);
    expect(built).not.toContain('var channel = "zoebuild.preview.navigation.v1"');
    expect(PREVIEW_NAV_SCRIPT).toContain('document.currentScript || document.querySelector');
    expect(PREVIEW_NAV_SCRIPT).toContain('bootstrapFailure("document-root-invalid")');
    expect(PREVIEW_NAV_SCRIPT).toContain('status: "installed"');
    expect(built).toContain('data-zoebuild-preview-root=');
    expect(PREVIEW_NAV_SCRIPT).toContain('new URL(location.href).origin');
    expect(PREVIEW_NAV_SCRIPT).not.toContain('destination.origin === location.origin');
    expect(built.indexOf("data-zoebuild-navigation-bridge")).toBeLessThan(built.indexOf('/src/main.tsx'));
    expect(injectReactPreviewNavigationBridge(built, BASE)).toBe(built);
    expect(injectReactPreviewNavigationBridge(html, "/approach/")).toBe(html);
    expect(injectReactPreviewNavigationBridge("not html", BASE)).toBe("not html");
    expect(PREVIEW_NAV_SCRIPT).toContain('data.action === "navigate"');
    expect(PREVIEW_NAV_SCRIPT).toContain('window.dispatchEvent(new PopStateEvent("popstate"))');
    expect(PREVIEW_NAV_SCRIPT).toContain('setInterval(function () { if (!document.hidden) report(); }, 1000)');
    expect(PREVIEW_NAV_SCRIPT).toContain('if (data.action === "probe") report(true)');
    expect(PREVIEW_NAV_SCRIPT).toContain('rendered: rendered, revision: revision');
    expect(PREVIEW_NAV_SCRIPT).toContain('var documentRevision = new URLSearchParams(location.search).get("__zb_preview_revision")');
    expect(PREVIEW_NAV_SCRIPT).toContain('var revision = documentRevision;');
    expect(PREVIEW_NAV_SCRIPT).toContain('renderObserver.observe(document.documentElement');
  });

  it("wires scoped HTML responses into the proxy, never assets or HEAD", () => {
    const route = readFileSync(resolve(__dirname, "../../app/api/build/projects/[buildProjectId]/preview/[previewId]/content/[capability]/[[...path]]/route.ts"), "utf8");
    expect(route).toContain('method === "GET" && result.status === 200');
    expect(route).toContain('^text\\/html(?:;|$)');
    expect(route).toContain("injectReactPreviewNavigationBridge(originalHtml, basePath)");
    expect(route).toContain('relativePath === "__zoebuild/navigation.js"');
    expect(route).toContain('resolveTrustedReactPreviewCapabilityAtRunner({');
    expect(route).toContain('method === "HEAD" ? null : PREVIEW_NAV_SCRIPT');
    expect(route).toContain('headers.delete("ETag")');
    expect(route).toContain('Server-Timing');
    expect(route).toContain('private, max-age=300');
  });
});
