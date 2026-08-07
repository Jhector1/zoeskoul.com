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

describe("Student bootstrap dark mode", () => {
  it("keeps a dark state-card override beside the base state card", () => {
    const css = readFileSync(
      resolve(
        process.cwd(),
        "src/shell.css",
      ),
      "utf8",
    );

    const base =
      css.indexOf(".student-state-card {");
    const dark =
      css.indexOf("html.dark .student-state-card {");

    expect(base).toBeGreaterThanOrEqual(0);
    expect(dark).toBeGreaterThan(base);
    expect(css).toContain(
      "background: rgba(23, 23, 23, 0.96);",
    );
    expect(css).toContain(
      "html.dark .student-state-card p",
    );
  });
});
