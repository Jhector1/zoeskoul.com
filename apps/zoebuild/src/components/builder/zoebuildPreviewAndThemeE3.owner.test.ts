import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repo = resolve(__dirname, "../../../../..");
function source(path: string) { return readFileSync(resolve(repo, path), "utf8"); }
const prefix = "apps/zoebuild/src/app/[locale]/projects/[buildProjectId]/";

describe("ZoeBuild E3 shared static preview and site settings theme", () => {
  it("routes static commerce through the same authenticated parent callback in both modes", () => {
    const shell = source(prefix + "ProjectBuilderShell.tsx");
    const code = source(prefix + "BuildWorkspaceClient.tsx");
    expect(shell).toContain("onCommerceRequest={");
    expect(shell).toContain("requestStaticPreviewCommerce");
    expect(shell).toContain("webPreviewCommerceRequest={");
    expect(code).toContain("webPreviewCommerceRequest={webPreviewCommerceRequest}");
    expect(code).toContain("webPreviewSessionKey={project.buildProjectId}");
  });
  it("keeps one generic WebPreview renderer and never alters other IDE callers", () => {
    const types = source("packages/learner-workspace/src/ide/types.ts");
    const runner = source("packages/learner-workspace/src/runner/CodeRunner.tsx");
    const output = source("packages/learner-workspace/src/runner/components/OutputSurface.tsx");
    expect(types).toContain("webPreviewCommerceRequest?:");
    expect(runner).toContain("onCommerceRequest: webPreviewCommerceRequest");
    expect(runner).toContain("webPreviewSessionKey ?? effectiveExerciseStateKey");
    expect(output).toContain("onCommerceRequest={model.onCommerceRequest}");
    expect(output).toContain("<WebPreview");
  });
  it("uses shared app light/dark tokens and keeps the storefront theme isolated", () => {
    const settings = source(prefix + "SiteSettingsWorkspacePanel.tsx");
    const styles = source(prefix + "SiteSettingsWorkspacePanel.module.css");
    const globals = source("apps/zoebuild/src/app/globals.css");
    expect(settings).toContain("import styles from");
    expect(settings).toContain("className={styles.navigation}");
    for (const token of ["--zb-bg", "--zb-surface", "--zb-text", "--zb-muted", "--zb-border", "--zb-accent"]) {
      expect(styles).toContain(`var(${token})`);
      expect(globals).toContain(token);
    }
    expect(styles).not.toContain("Canvas");
  });
});
