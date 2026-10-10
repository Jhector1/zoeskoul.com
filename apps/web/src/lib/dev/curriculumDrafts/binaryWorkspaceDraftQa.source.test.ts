import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("Draft QA binary workspace boundary", () => {
  it("routes binary workspace nodes through CodeRunner to the shared BinaryFileViewer", () => {
    const editor = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "packages/learner-workspace/src/fullide/panes/IdeEditorPane.tsx",
      ),
      "utf8",
    );
    const runner = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "packages/learner-workspace/src/runner/CodeRunner.tsx",
      ),
      "utf8",
    );
    const viewer = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "packages/learner-workspace/src/fullide/panes/BinaryFileViewer.tsx",
      ),
      "utf8",
    );

    expect(editor).toContain("isBinaryFileNode");
    expect(editor).toContain("activeBinaryFile");
    expect(runner).toContain(
      'import BinaryFileViewer from "@zoeskoul/learner-workspace/fullide/panes/BinaryFileViewer"',
    );
    expect(runner).toContain("<BinaryFileViewer");
    expect(runner).toContain("args.binary");
    expect(viewer).toContain("mimeType");
    expect(viewer).toContain("normalizeWorkspaceBase64");
  });
});
