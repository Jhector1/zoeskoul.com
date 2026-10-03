import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relative: string) =>
  fs.readFileSync(path.resolve(process.cwd(), relative), "utf8");

const shared = read("packages/learner-workspace/src/ui/ResizeSeparator.tsx");
const desktop = read(
  "packages/learner-workspace/src/fullide/chrome/IdeDesktopLayout.tsx",
);
const runner = read(
  "packages/learner-workspace/src/runner/CodeRunner.tsx",
);

describe("shared ResizeSeparator", () => {
  it("is the single visual owner for left, bottom, and right resizers", () => {
    expect(desktop).toContain("<ResizeSeparator");
    expect(desktop).toContain('orientation="vertical"');
    expect(runner).toContain('data-testid="runner-bottom-split-resizer"');
    expect(runner).toContain('orientation="horizontal"');
    expect(runner).toContain('data-testid="runner-right-split-resizer"');
    expect(runner).toContain('orientation="vertical"');
  });

  it("owns size and cursor with inline runtime styles", () => {
    expect(shared).toContain('width: "100%"');
    expect(shared).toContain("height: 6");
    expect(shared).toContain("width: 6");
    expect(shared).toContain('height: "100%"');
    expect(shared).toContain('"row-resize"');
    expect(shared).toContain('"col-resize"');
  });

  it("owns hover and focus visual state without Tailwind scanning", () => {
    expect(shared).toContain("const [hovered, setHovered] = React.useState(false)");
    expect(shared).toContain("const [focused, setFocused] = React.useState(false)");
    expect(shared).toContain("backgroundColor: active ? ACTIVE_BACKGROUND : IDLE_BACKGROUND");
    expect(shared).not.toContain("hover:bg-");
    expect(shared).not.toContain("dark:hover:");
  });

  it("suppresses native focus flash", () => {
    expect(shared).toContain('outline: "none"');
    expect(shared).toContain('boxShadow: "none"');
  });
});
