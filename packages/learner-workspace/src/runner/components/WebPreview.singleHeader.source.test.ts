import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const preview = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "packages/learner-workspace/src/runner/components/WebPreview.tsx",
  ),
  "utf8",
);

describe("WebPreview header ownership", () => {
  it("does not render a second inner Preview label", () => {
    expect(preview).not.toContain(">Preview<");
  });

  it("keeps the shared virtual URL bar directly with the preview content", () => {
    expect(preview).toContain('aria-label="Preview URL"');
    expect(preview).toContain('value={`/${virtualPath}`}');
    expect(preview).toContain("readOnly");
    expect(preview).toContain("data-web-preview-frame");
  });
});
