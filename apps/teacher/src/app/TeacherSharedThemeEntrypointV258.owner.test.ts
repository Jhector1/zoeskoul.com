import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const cwd = path.resolve(process.cwd());
const repoRoot = cwd.endsWith("/apps/teacher")
  ? path.resolve(cwd, "../..")
  : cwd;

const read = (relativePath: string) =>
  fs.readFileSync(
    path.join(repoRoot, relativePath),
    "utf8",
  );

const teacherStyles = read("apps/teacher/src/styles.css");
const sharedUi = read("packages/ui-styles/ui.css");
const sharedPalette = read(
  "packages/ui-styles/ui/palette.css",
);

describe("Teacher shared theme entrypoint V258", () => {
  it("uses the same canonical ui.css entrypoint as Web and Student", () => {
    expect(teacherStyles).toContain(
      '@import "../../../packages/ui-styles/ui.css";',
    );
    expect(teacherStyles).not.toContain(
      "packages/ui-styles/colors.css",
    );
    expect(teacherStyles).not.toContain(
      "packages/ui-styles/ui-v2.css",
    );
  });

  it("canonical ui.css owns the palette that provides ui-bg", () => {
    expect(sharedUi).toMatch(/palette\.css/);
    expect(sharedPalette).toMatch(
      /\.ui-bg\s*\{[\s\S]*?background-color:\s*rgb\(var\(--ui-bg\)\s*\/\s*1\)/,
    );
  });
});
