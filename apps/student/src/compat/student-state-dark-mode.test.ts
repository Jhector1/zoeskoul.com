import {
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";

describe("Student bootstrap semantic theme ownership", () => {
  it("uses shared UI tokens instead of a separate dark card override", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/shell.css"),
      "utf8",
    );

    expect(css).toContain("background: rgb(var(--ui-bg) / 1);");
    expect(css).toContain("background: rgb(var(--ui-surface) / 0.94);");
    expect(css).toContain("color: rgb(var(--ui-text-muted) / 0.88);");
    expect(css).not.toContain("html.dark .student-state-card");
    expect(css).not.toContain("background: rgba(23, 23, 23, 0.96);");
  });
});
