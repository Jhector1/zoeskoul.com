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
    expect(remote).not.toContain("allow-same-origin");
  });

  it("keeps the opaque transport URL out of browser chrome", () => {
    const remote = source("./components/RemoteWebPreview.tsx");
    expect(remote).toContain('const displayUrl = preview.src ? "/" : statusLabel;');
    expect(remote).toContain("value={displayUrl}");
    expect(remote).not.toContain("value={preview.src");
  });

  it("double-buffers remote revisions so the last loaded frame stays visible", () => {
    const remote = source("./components/RemoteWebPreview.tsx");
    expect(remote).toContain("frameSources");
    expect(remote).toContain("activeFrame");
    expect(remote).toContain("otherFrame(activeFrame)");
    expect(remote).toContain("onLoad={() => activateFrame(index, src)}");
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
});
