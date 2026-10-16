import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repo = resolve(__dirname, "../../../../..");
const source = (path: string) =>
  readFileSync(resolve(repo, path), "utf8");

describe("ZoeBuild compact project topbar controls", () => {
  const shell = source(
    "apps/zoebuild/src/app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx",
  );
  const publish = source(
    "apps/zoebuild/src/components/builder/PublishProjectButton.tsx",
  );
  const css = source("apps/zoebuild/src/app/globals.css");

  it("opens project workspaces in Preview after refresh", () => {
    expect(shell).toContain('useState<ZoeBuildMode>("preview")');
    expect(shell).not.toMatch(
      /useState<ZoeBuildMode>\(\s*"code",?\s*\)/,
    );
  });

  it("shows appropriate icons beside Preview and Code", () => {
    expect(shell).toContain(
      'ProjectPreviewIcon',
    );
    expect(shell).toContain(
      'ProjectCodeIcon',
    );
    expect(shell).toContain(
      '<ProjectPreviewIcon className="zb-project-mode-icon" />',
    );
    expect(shell).toContain(
      '<ProjectCodeIcon className="zb-project-mode-icon" />',
    );
    expect(shell).not.toContain('"lucide-react"');
  });

  it("shows a publish icon without changing publish behavior", () => {
    expect(publish).toContain(
      'ProjectPublishIcon',
    );
    expect(publish).toContain(
      '<ProjectPublishIcon className="zb-project-publish-icon" />',
    );
    expect(publish).not.toContain('"lucide-react"');
    expect(publish).toContain(
      'className="zb-project-publish-button"',
    );
    expect(publish).toContain('"Publish"');
  });

  it("uses compact project controls", () => {
    expect(css).toContain("min-height: 27px;");
    expect(css).toContain("padding: 0 9px;");
    expect(css).toContain(".zb-project-mode-icon {");
    expect(css).toContain("min-height: 29px;");
    expect(css).toContain("padding: 0 11px;");
    expect(css).toContain(".zb-project-publish-icon {");
  });
  it("keeps topbar controls single-line and compact", () => {
    expect(css).toContain("ZOEBUILD_COMPACT_PROJECT_TOPBAR_V2");
    expect(css).toContain("height: 25px !important;");
    expect(css).toContain("height: 27px !important;");
    expect(css).toContain("flex-direction: row !important;");
    expect(css).toContain("white-space: nowrap !important;");
    expect(css).toContain("width: 11px !important;");
  });

});
