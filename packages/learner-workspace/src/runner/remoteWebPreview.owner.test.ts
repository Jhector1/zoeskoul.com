import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relative: string) {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

describe("generic remote web preview seam", () => {
  it("keeps static WebPreview and adds one remote OutputSurface variant", () => {
    const output = source("./components/OutputSurface.tsx");
    expect(output).toContain('kind: "web-preview"');
    expect(output).toContain("<WebPreview");
    expect(output).toContain('kind: "remote-web-preview"');
    expect(output).toContain("<RemoteWebPreview");
  });

  it("threads the optional remote preview through canonical FullIDE", () => {
    const fullIde = source("../fullide/FullIDE.tsx");
    const pane = source("../fullide/panes/IdeEditorPane.tsx");
    const runner = source("./CodeRunner.tsx");
    expect(fullIde).toContain("remoteWebPreview={remoteWebPreview}");
    expect(pane).toContain("remoteWebPreview={remoteWebPreview}");
    expect(runner).toContain('kind: "remote-web-preview"');
  });

  it("keeps the remote iframe opaque", () => {
    const remote = source("./components/RemoteWebPreview.tsx");
    expect(remote).toContain('sandbox="allow-scripts allow-forms allow-modals"');
    expect(remote).not.toMatch(/sandbox=["'][^"']*\ballow-same-origin\b/);
  });

  it("keeps the opaque transport URL out of browser chrome", () => {
    const remote = source("./components/RemoteWebPreview.tsx");
    expect(remote).toContain('const displayUrl = preview.src ? displayPath : statusLabel;');
    expect(remote).toContain("value={pickerOpen ? pageSearch : visibleUrl}");
    expect(remote).toContain('const [routeSynced, setRouteSynced] = useState(false)');
    expect(remote).toContain('setPendingRoute(route)');
    expect(remote).toContain('role="combobox"');
    expect(remote).not.toContain("value={preview.src");
  });

  it("tracks in-frame routes and navigation without granting same-origin access", () => {
    const remote = source("./components/RemoteWebPreview.tsx");
    expect(remote).toContain('aria-label="Preview back"');
    expect(remote).toContain('aria-label="Preview forward"');
    expect(remote).toContain('aria-label="Preview URL"');
    expect(remote).toContain('aria-label="Available project pages"');
    expect(remote).toContain('role="combobox"');
    expect(remote).toContain('action:"navigate",route');
    expect(remote).toContain('frame?.contentWindow === event.source');
    expect(remote).toContain('value.rendered !== "boolean"');
    expect(remote).toContain('value.revision !== expectedRevision');
    expect(remote).toContain('event.origin !== "null"');
    expect(remote).toContain('value.basePath !== preview.src');
    expect(remote).toContain('"Cancel preview refresh"');
    expect(remote).toContain('controller.abort()');
  });

  it("double-buffers remote revisions so the last loaded frame stays visible", () => {
    const remote = source("./components/RemoteWebPreview.tsx");
    expect(remote).toContain("frameSources");
    expect(remote).toContain("activeFrame");
    expect(remote).toContain("otherFrame(activeFrame)");
    expect(remote).toContain("frameIndex !== activeFrame && candidate");
    expect(remote).toContain('action: "probe"');
    expect(remote).toContain("data-preview-frame-active");
    expect(remote).toContain('"pointer-events-none z-0 opacity-0"');
  });

  it("restarts an expired preview before exposing the proxy error document", () => {
    const remote = source("./components/RemoteWebPreview.tsx");
    expect(remote).toContain('response.status === 404');
    expect(remote).toContain("expiredCandidateRef");
    expect(remote).toContain("preview.onRetry?.()");
    expect(remote).toContain('cache: "no-store"');
  });
    it("never promotes a non-success proxy response into the preview frame buffer", () => {
        const remote = source("./components/RemoteWebPreview.tsx");
        expect(remote).toContain("if (!response.ok) {");
        expect(remote).toContain("response.status === 404");
        expect(remote).toContain("preview.onRetry?.();");
        const failureGate = remote.indexOf("if (!response.ok) {");
        const framePromotion = remote.indexOf("setFrameSources((current)");
        expect(failureGate).toBeGreaterThan(-1);
        expect(framePromotion).toBeGreaterThan(failureGate);
    });

});
