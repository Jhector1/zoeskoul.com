import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function between(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return source.slice(start, end);
}

describe("HTML Module 2 editor model identity", () => {
  const runner = read(
    "packages/learner-workspace/src/runner/CodeRunner.tsx",
  );
  const editorPane = read(
    "packages/learner-workspace/src/runner/components/EditorPane.tsx",
  );

  const renderSurface = between(
    runner,
    "    const renderEditorSurface = (args: {",
    "    const renderEditorPane = (editorHeight: number) => {",
  );

  it("forwards the deterministic model key at the shared EditorPane boundary", () => {
    expect(renderSurface).toContain("modelKey: string;");
    expect(renderSurface).toContain("modelKey={args.modelKey}");
    expect((renderSurface.match(/<EditorPane/g) ?? []).length).toBe(1);
    expect(
      (renderSurface.match(/modelKey=\{args\.modelKey\}/g) ?? []).length,
    ).toBe(1);
  });

  it("keeps the primary active-file model identity deterministic", () => {
    expect(runner).toContain("const effectiveEditorModelKey =");
    expect(runner).toContain("modelKey: effectiveEditorModelKey");
    expect(runner).toContain(
      '`${effectiveExerciseStateKey}:${workspaceFileIdForIdentity || "entry"}`',
    );
  });

  it("keeps split-editor identity deterministic", () => {
    expect(runner).toContain(
      'modelKey: `${effectiveExerciseStateKey}:${splitEditor.fileId}`',
    );
  });

  it("uses the existing shared EditorPane model identity contract", () => {
    expect(editorPane).toContain("modelKey");
  });
});
