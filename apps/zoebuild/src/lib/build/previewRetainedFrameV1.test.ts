import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("preview version-transition backdrop", () => {
  it("retains only a prior ready frame and disables interaction while it is stale", () => {
    const host = readFileSync(resolve(process.cwd(), "src/components/builder/PersistentReactPreviewHost.tsx"), "utf8");
    expect(host).toContain('entry?.preview?.state === "ready"');
    expect(host).toContain('lastReadyPreviewRef.current?.projectId===entry?.buildProjectId');
    expect(host).toContain('const isPreparing=entry?.preview?.state === "starting"');
    expect(host).not.toContain('entry?.preview?.src===null');
    expect(host).toContain('inert={Boolean(previousPreview)}');
    expect(host).toContain('data-preview-previous-version');
    expect(host).toContain('previewViewerIdentity(entry.buildProjectId, renderedPreview.src)');
    expect(host).not.toContain('allow-same-origin');
  });
});
