import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("HTML Module 2 one-click file selection hydration", () => {
  const repoRoot = path.resolve(process.cwd(), "../..");

  const fullIde = fs.readFileSync(
    path.join(repoRoot, "packages/learner-workspace/src/fullide/FullIDE.tsx"),
    "utf8",
  );

  const control = fs.readFileSync(
    path.join(repoRoot, "packages/learner-workspace/src/ide/fullide/externalWorkspaceControl.ts"),
    "utf8",
  );

  const editor = fs.readFileSync(
    path.join(repoRoot, "packages/learner-workspace/src/fullide/panes/IdeEditorPane.tsx"),
    "utf8",
  );

  const viewer = fs.readFileSync(
    path.join(repoRoot, "packages/learner-workspace/src/fullide/panes/BinaryFileViewer.tsx"),
    "utf8",
  );

  it("uses semantic content identity for normal controlled hydration", () => {
    expect(control).toContain("workspaceControlledContentKey");
    expect(fullIde).toContain(
      "workspaceControlledContentKey(externalWorkspace)",
    );
    expect(fullIde).toContain(
      "workspaceControlledContentKey(workspace.derived.currentWorkspace)",
    );
    expect(fullIde).toContain(
      "nextControlKey !== currentWorkspaceControlKeyRef.current",
    );
  });

  it("keeps explicit replacement acknowledgement on the content-key domain", () => {
    expect(fullIde).toContain(
      "requestedWorkspaceKey: externalWorkspaceControlKey",
    );
    expect(fullIde).toContain(
      "committedWorkspaceKey: currentWorkspaceControlKey",
    );
    expect(fullIde).toContain("const currentKey = currentWorkspaceNotifyKey;");
  });

  it("preserves the binary viewer selection path", () => {
    expect(editor).toContain("isBinaryFileNode(activeFile)");
    expect(editor).toContain("activeBinaryFile");
    expect(viewer).toContain("normalizeWorkspaceBase64");
    expect(viewer).toContain("mimeType");
  });
});
