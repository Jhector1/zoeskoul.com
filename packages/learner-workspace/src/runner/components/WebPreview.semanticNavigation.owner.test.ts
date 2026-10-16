import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(
    process.cwd(),
    "packages/learner-workspace/src/runner/components/WebPreview.tsx",
  ),
  "utf8",
);

describe("WebPreview semantic static navigation ownership", () => {
  it("resolves semantic anchors before installing the preview navigation bridge", () => {
    expect(source).toContain(
      "const routePath = resolveWebPreviewHtmlPath(htmlPaths, resolved);",
    );
    expect(source).toContain(
      'data-zoeskoul-preview-path="/${routePath}"',
    );
  });

  it("keeps hashes and external schemes out of document navigation interception", () => {
    expect(source).toContain(
      "function isWebPreviewDocumentNavigationTarget(value: unknown)",
    );
    expect(source).toContain('!href.startsWith("#")');
    expect(source).toContain('!href.startsWith("//")');
    expect(source).toContain(
      "!/^[a-z][a-z0-9+.-]*:/i.test(href)",
    );
  });

  it("resolves root-relative paths from workspace root", () => {
    expect(source).toContain(
      'const baseDir = raw.startsWith("/") ? "" : dirname(fromFile);',
    );
  });

  it("uses the same semantic resolver for iframe messages", () => {
    expect(source).toContain(
      "const path = resolveWebPreviewHtmlPath(\n                    htmlPaths,\n                    message.path,",
    );
  });
});
