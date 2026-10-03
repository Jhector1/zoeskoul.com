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

describe("CodeRunner terminal/editor split-resizer presentation", () => {
  it("keeps both draggable separator owners in the shared runner", () => {
    expect(source).toContain('data-testid="runner-bottom-split-resizer"');
    expect(source).toContain('data-testid="runner-right-split-resizer"');
    expect(source).toContain("split.onPointerDownSplit");
    expect(source).toContain("split.separatorProps.onKeyDown");
  });

  it("uses explicit pointer/focus state for the resizer grip", () => {
    expect(source).toContain(
      "const [isSplitResizerActive, setIsSplitResizerActive] = useState(false);",
    );
    expect(source).toContain(
      "onPointerEnter={() => setIsSplitResizerActive(true)}",
    );
    expect(source).toContain(
      "onPointerLeave={() => setIsSplitResizerActive(false)}",
    );
    expect(source).toContain("onFocus={() => setIsSplitResizerActive(true)}");
    expect(source).toContain("onBlur={() => setIsSplitResizerActive(false)}");
  });

  it("does not use the old Tailwind-owned split grip constants", () => {
    expect(source).not.toContain("const SPLIT_GRIP_IDLE");
    expect(source).not.toContain("const SPLIT_GRIP_ACTIVE");
  });

  it("suppresses the browser white focus flash on the separator", () => {
    expect(source).toContain('outline: "none"');
    expect(source).toContain('boxShadow: "none"');
    expect(source).toContain('background: "transparent"');
  });

  it("shows the grip from inline state on hover/focus or while dragging", () => {
    expect(source).toContain('data-testid="runner-bottom-split-grip"');
    expect(source).toContain('data-testid="runner-right-split-grip"');
    expect(source).toContain(
      "isSplitResizerActive || split.isResizing ? 1 : 0",
    );
    expect(source).toContain('"rgba(148, 163, 184, 0.95)"');
    expect(source).toContain('"rgb(14 165 233)"');
  });

  it("keeps the resize cursors and 8px hit targets", () => {
    expect(source).toContain('"group relative z-20 h-2 shrink-0 touch-none"');
    expect(source).toContain('"group relative z-20 w-2 shrink-0 touch-none"');
    expect(source).toContain("cursor-row-resize");
    expect(source).toContain("cursor-col-resize");
  });
});
