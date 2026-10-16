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
});
