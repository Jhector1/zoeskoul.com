import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

const shell = readFileSync(new URL("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../../app/[locale]/projects/[buildProjectId]/BuildWorkspaceClient.tsx", import.meta.url), "utf8");
const mediaHook = readFileSync(new URL("./useZoeProjectMediaExplorer.ts", import.meta.url), "utf8");
const fullIde = readFileSync(new URL("../../../../../packages/learner-workspace/src/fullide/FullIDE.tsx", import.meta.url), "utf8");
const explorer = readFileSync(new URL("../../../../../packages/learner-workspace/src/fullide/panes/IdeExplorerPane.tsx", import.meta.url), "utf8");

/** AI4B4D: ZoeBuild reuses, rather than duplicates, the canonical file uploader. */
describe("ZoeBuild canonical FullIDE file and image uploads", () => {
  it("does not mount the redundant project-images uploader in the Zoé top rail", () => {
    expect(shell).not.toContain("import ProjectMediaLibrary");
    expect(shell).not.toContain("<ProjectMediaLibrary");
  });

  it("retains owner-scoped R2 open-in-Code integration for existing images", () => {
    expect(shell).toContain("ZOE_MEDIA_OPEN");
    expect(workspace).toContain("useZoeProjectMediaExplorer");
    expect(workspace).toContain("externalWorkspace={mediaExplorer.externalWorkspace}");
    expect(workspace).toContain("onWorkspaceChange={mediaExplorer.onWorkspaceChange}");
  });

  it("does not restart media refresh on parent callback changes or hydrate empty media", () => {
    expect(mediaHook).toContain("canonicalChangeRef.current = onCanonicalWorkspaceChange");
    expect(mediaHook).toContain("[buildProjectId,emitCanonicalChange,publishProjection,sourceWorkspaceRef]");
    expect(mediaHook).not.toContain("[buildProjectId,onCanonicalWorkspaceChange,publishProjection,sourceWorkspaceRef]");
    expect(mediaHook).toContain("images.length === 0 && (!projectionRef.current ||");
    expect(mediaHook).toContain("projectionRef.current.virtualNodeIds.size === 0)) return;");
  });
  it("uses the real FullIDE import controls for files including supported images", () => {
    expect(workspace).toContain("<FullIDE");
    expect(workspace).toContain('servicePreset="workspace"');
    expect(workspace).toContain("showActions: true");
    expect(workspace).toContain("canUseMultiFile: true");
    expect(fullIde).toContain("actions.importExternalFiles(files)");
    expect(explorer).toContain("readBrowserFile(file, file.name, importReadLimits)");
    expect(explorer).toContain("actions.importExternalFiles(imported)");
    expect(explorer).toContain('resolveWorkspaceFileCapability(path)');
  });
});
