import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repo = resolve(__dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(repo, path), "utf8");

// Source ownership regression tests; browser visual checks remain required.
describe("ZoeBuild E4 shared dark-mode ownership", () => {
  it("binds Tailwind's dark utilities to the application's .dark state", () => {
    const css = read("apps/zoebuild/src/app/globals.css");
    expect(css).toContain("@custom-variant dark (&:where(.dark, .dark *));");
    expect(css).toContain('@source "../../../../packages/learner-workspace/src";');
    expect(css).toContain(".dark {");
  });

  it("keeps the IDE explorer, tabs and layout class-driven and theme-aware", () => {
    const base = "packages/learner-workspace/src/fullide/";
    const explorer = read(base + "panes/IdeExplorerPane.tsx");
    const tree = read(base + "ExplorerTree.tsx");
    const tabs = read(base + "TabsBar.tsx");
    const desktop = read(base + "chrome/IdeDesktopLayout.tsx");
    const full = read(base + "FullIDE.tsx");
    for (const part of [explorer, tree, tabs, desktop, full]) {
      expect(part).toContain("dark:");
    }
    expect(explorer).toContain("dark:bg-black/20");
    expect(full).toContain("dark:bg-white/[0.04]");
  });

  it("uses one builder background while preserving the storefront sandbox", () => {
    const css = read("apps/zoebuild/src/app/globals.css");
    const builder = css.split(".zb-project-frame {")[1];
    expect(builder).toContain("--background: var(--zb-bg);");
    expect(css).toContain("--zb-bg:");
    expect(css).toContain(".dark {");
    const shell = read("apps/zoebuild/src/app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx");
    expect(shell).toContain("<WebPreview");
    expect(shell).toContain("onCommerceRequest={");
  });

  it("uses the app-specific Vitest configuration, not the repository root default", () => {
    const config = read("apps/zoebuild/vitest.config.ts");
    expect(config).toContain('"apps/zoebuild/src/**/*.test.ts"');
    expect(config).toContain('"apps/zoebuild/src/**/*.test.tsx"');
  });
});
