import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(
    process.cwd(),
    "packages/learner-workspace/src/runner/components/webPreviewBridge.ts",
  ),
  "utf8",
);

describe("WebPreview srcDoc hash navigation ownership", () => {
  it("intercepts hash anchors before native srcDoc navigation can reach the host URL", () => {
    expect(source).toContain('const anchor = node?.closest?.("a");');
    expect(source).toContain('if (href?.startsWith("#")) {');
    expect(source).toContain("event.preventDefault();");
  });

  it("scrolls fragments inside the preview document", () => {
    expect(source).toContain("decodeURIComponent(encodedTarget)");
    expect(source).toContain(".getElementById(targetId)");
    expect(source).toContain("?.scrollIntoView?.({");
  });

  it("keeps virtual document navigation on the existing structured bridge", () => {
    expect(source).toContain(
      'const path = anchor.getAttribute("data-zoeskoul-preview-path");',
    );
    expect(source).toContain('post("navigate", { path });');
  });

  it("does not weaken iframe isolation", () => {
    expect(source).not.toContain("allow-same-origin");
  });
});
