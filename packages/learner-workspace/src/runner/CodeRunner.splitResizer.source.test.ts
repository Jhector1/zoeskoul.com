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
const separatorSource = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "packages/learner-workspace/src/ui/ResizeSeparator.tsx",
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

  it("delegates pointer and focus state to the shared separator", () => {
    expect(source).toContain('import ResizeSeparator from "../ui/ResizeSeparator"');
    expect(separatorSource).toContain("const [hovered, setHovered] = React.useState(false)");
    expect(separatorSource).toContain("const [focused, setFocused] = React.useState(false)");
    expect(separatorSource).toContain("onPointerEnter={(event) =>");
    expect(separatorSource).toContain("onPointerLeave={(event) =>");
  });

  it("does not use the old Tailwind-owned split grip constants", () => {
    expect(source).not.toContain("const SPLIT_GRIP_IDLE");
    expect(source).not.toContain("const SPLIT_GRIP_ACTIVE");
  });

  it("suppresses the browser white focus flash on the separator", () => {
    expect(separatorSource).toContain('outline: "none"');
    expect(separatorSource).toContain('boxShadow: "none"');
  });

  it("shows shared inline hover and focus feedback", () => {
    expect(separatorSource).toContain(
      "backgroundColor: active ? ACTIVE_BACKGROUND : IDLE_BACKGROUND",
    );
    expect(separatorSource).toContain('transition: "background-color 120ms ease"');
  });

  it("keeps axis-specific resize cursors and hit targets", () => {
    expect(separatorSource).toContain("height: 6");
    expect(separatorSource).toContain("width: 6");
    expect(separatorSource).toContain('"row-resize"');
    expect(separatorSource).toContain('"col-resize"');
  });
});
