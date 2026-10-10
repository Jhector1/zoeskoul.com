import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("Sandbox versus Lesson IDE reconciliation", () => {
  const sandbox = read(
    "apps/web/src/components/sandbox/ProgrammingSandbox.tsx",
  );
  const resolver = read(
    "packages/learning-runtime/src/review/module/runtime/resolveWorkspaceForTarget.ts",
  );
  const runtime = read(
    "packages/learning-runtime/src/review/module/runtime/reviewRuntimeStore.ts",
  );
  const tools = read(
    "apps/web/src/components/review/module/context/ReviewToolsContext.tsx",
  );
  const runner = read(
    "packages/learner-workspace/src/runner/CodeRunner.tsx",
  );

  it("keeps one shared IDE owner", () => {
    expect(sandbox).toContain("<FullIDE");
    expect(runner).toContain("modelKey={args.modelKey}");
  });

  it("makes Lesson reconciliation restore canonical binary assets", () => {
    expect(resolver).toContain("const canonicalBinaryAssets = workspaceFileEntries(");
    expect(runtime).toContain("restoreCanonicalRuntimeBinaryAssets");
  });

  it("keeps protected registration semantic and binary-aware", () => {
    expect(tools).toContain("return workspaceRegistrationKeyOf(workspace)");
    expect(tools).toContain('content: binary ? "" : String(node.content ?? "")');
  });

  it("keeps collapse detection focused on text files", () => {
    expect(resolver).toContain(
      "workspaceFileEntries(args.savedWorkspace)\n    .filter((file) => !file.binary)",
    );
    expect(resolver).toContain(
      "workspaceFileEntries(args.manifestWorkspace)\n    .filter((file) => !file.binary)",
    );
  });
});
