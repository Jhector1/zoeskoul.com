import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "packages/learner-workspace/src/runner/components/XtermTerminal.tsx",
  ),
  "utf8",
);

describe("XtermTerminal measurement probe", () => {
  it("keeps the M probe measurable but permanently off-screen", () => {
    expect(source).toContain('data-testid="terminal-font-measure-probe"');
    expect(source).toContain('position: "absolute"');
    expect(source).toContain("left: -9999");
    expect(source).toContain("top: -9999");
    expect(source).toContain('visibility: "hidden"');
    expect(source).toContain("MMMMMMMMMM");
  });

  it("does not depend on Tailwind arbitrary-position classes", () => {
    expect(source).not.toContain("-left-[9999px]");
    expect(source).not.toContain("-top-[9999px]");
  });
});
