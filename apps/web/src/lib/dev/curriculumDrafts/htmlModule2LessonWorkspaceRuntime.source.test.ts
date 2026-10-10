import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("HTML lesson workspace runtime boundary", () => {
  const resolver = read(
    "packages/learning-runtime/src/review/module/runtime/resolveWorkspaceForTarget.ts",
  );
  const fullIde = read(
    "packages/learner-workspace/src/fullide/FullIDE.tsx",
  );
  const explorer = read(
    "packages/learner-workspace/src/fullide/ExplorerTree.tsx",
  );

  it("uses canonical manifestWorkspace instead of retired starterFiles mirror", () => {
    expect(resolver).toContain(
      "workspaceFileEntries(args.manifest.manifestWorkspace)",
    );
    expect(resolver).not.toContain("args.manifest.starterFiles");
  });

  it("signals editor selection after workspaceActiveFileId commits", () => {
    expect(fullIde).toContain(
      "lastCommittedWorkspaceActiveFileIdRef",
    );
    expect(fullIde).toContain(
      "setWorkspaceFileSelectionVersion((version) => version + 1);",
    );

    const openHandler =
      fullIde.match(
        /const handleOpenWorkspaceFile = useCallback\([\s\S]*?\n    \);/,
      )?.[0] ?? "";
    expect(openHandler).toContain("actions.openFile(id);");
    expect(openHandler).not.toContain("setWorkspaceFileSelectionVersion");
  });

  it("renders the entry marker as icon-only while keeping an accessible name", () => {
    expect(explorer).toContain('<IconPlay className="h-3 w-3" />');
    expect(explorer).toContain('aria-label={t("entryBadge")}');
    expect(explorer).not.toContain("ui-pill-good");
    expect((explorer.match(/\{t\("entryBadge"\)\}/g) ?? []).length).toBe(1);
  });
});
