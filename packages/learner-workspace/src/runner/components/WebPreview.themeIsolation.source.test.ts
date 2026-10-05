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

describe("WebPreview theme isolation", () => {
  it("pins the embedded browser surface to a neutral light color scheme", () => {
    expect(source).toContain('colorScheme: "light"');
    expect(source).toContain('backgroundColor: "#ffffff"');
  });

  it("does not inject the ZoeSkoul theme into learner-authored preview HTML", () => {
    expect(source).not.toContain("prefers-color-scheme: dark");
    expect(source).not.toContain("data-theme=\"dark\"");
    expect(source).not.toContain("class=\"dark\"");
  });
});
