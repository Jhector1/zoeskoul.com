import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "packages/learner-workspace/src/runner/components/WebPreview.tsx",
  ),
  "utf8",
);

describe("WebPreview browser chrome", () => {
  it("shows one dynamic virtual address bar for the shared web preview", () => {
    expect(source).toContain('aria-label="Preview URL"');
    expect(source).toContain('value={`/${virtualPath}`}');
    expect(source).toContain("readOnly");
    expect(source.match(/aria-label="Preview URL"/g)).toHaveLength(1);
  });

  it("keeps the actual renderer as the shared srcDoc iframe", () => {
    expect(source).toContain("srcDoc={srcDoc}");
    expect(source).toContain("data-web-preview-frame");
  });
});
