import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "packages/learner-workspace/src/runner/CodeRunner.tsx",
  ),
  "utf8",
);

describe("CodeRunner plain-frame integration", () => {
  it("keeps the FullIDE/plain runner flush without an outer border", () => {
    expect(source).toContain("const RUNNER_SURFACE =");
    expect(source).toContain(
      '"overflow-hidden bg-neutral-50/60 dark:bg-black/20";',
    );
    expect(source).toContain(
      'frame === "plain" ? "" : RUNNER_SURFACE_FRAMED',
    );
  });

  it("preserves the normal framed border for standalone/card runners", () => {
    expect(source).toContain("const RUNNER_SURFACE_FRAMED =");
    expect(source).toContain(
      '"border border-neutral-200 dark:border-white/10";',
    );
  });

  it("does not hide Monaco scrollbar ownership", () => {
    expect(source).not.toContain("verticalScrollbarSize: 0");
    expect(source).not.toContain('vertical: "hidden"');
  });
});
