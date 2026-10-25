import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { injectReactPreviewNavigationBridge, PREVIEW_NAV_CHANNEL } from "./reactPreviewNavigationBridge";

const BASE = "/api/build/projects/preview-fixture/preview/preview_11111111-1111-1111-1111-111111111111/content/ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef/";

describe("opaque React preview navigation bridge", () => {
  it("injects before Vite scripts once and embeds only the authorized preview root", () => {
    const html = '<!doctype html><html><head><script type="module" src="/src/main.tsx"></script></head><body></body></html>';
    const built = injectReactPreviewNavigationBridge(html, BASE);
    expect(built).toContain(PREVIEW_NAV_CHANNEL);
    expect(built).toContain(JSON.stringify(BASE));
    expect(built.indexOf("data-zoebuild-navigation-bridge")).toBeLessThan(built.indexOf('/src/main.tsx'));
    expect(injectReactPreviewNavigationBridge(built, BASE)).toBe(built);
    expect(injectReactPreviewNavigationBridge(html, "/approach/")).toBe(html);
    expect(injectReactPreviewNavigationBridge("not html", BASE)).toBe("not html");
    expect(built).toContain('data.action === "navigate"');
    expect(built).toContain('window.dispatchEvent(new PopStateEvent("popstate"))');
    expect(built).toContain('setInterval(function () { if (!document.hidden) report(); }, 1000)');
    expect(built).toContain('if (data.action === "probe") report(true)');
    expect(built).toContain('rendered: rendered, revision: revision');
    expect(built).toContain('var documentRevision = new URLSearchParams(location.search).get("__zb_preview_revision")');
    expect(built).toContain('var revision = documentRevision;');
    expect(built).toContain('renderObserver.observe(document.documentElement');
  });

  it("wires scoped HTML responses into the proxy, never assets or HEAD", () => {
    const route = readFileSync(resolve(__dirname, "../../app/api/build/projects/[buildProjectId]/preview/[previewId]/content/[capability]/[[...path]]/route.ts"), "utf8");
    expect(route).toContain('method === "GET" && result.status === 200');
    expect(route).toContain('^text\\/html(?:;|$)');
    expect(route).toContain("injectReactPreviewNavigationBridge(originalHtml, basePath)");
    expect(route).toContain('headers.delete("ETag")');
    expect(route).toContain('Server-Timing');
    expect(route).toContain('private, max-age=300');
  });
});
