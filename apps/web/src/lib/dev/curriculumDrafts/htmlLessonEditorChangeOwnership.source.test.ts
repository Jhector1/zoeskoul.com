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

describe("HTML Lesson editor change ownership", () => {
  const runner = read(
    "packages/learner-workspace/src/runner/CodeRunner.tsx",
  );
  const editor = read(
    "packages/learner-workspace/src/runner/components/EditorPane.tsx",
  );

  const renderSurface = between(
    runner,
    "    const renderEditorSurface = (args: {",
    "    const renderEditorPane = (editorHeight: number) => {",
  );

  it("keys the full EditorPane instance by deterministic model identity", () => {
    expect(renderSurface).toContain("key={args.modelKey}");
    expect(renderSurface).toContain("modelKey={args.modelKey}");
    expect(
      (renderSurface.match(/key=\{args\.modelKey\}/g) ?? []).length,
    ).toBe(1);
  });

  it("validates Monaco change ownership against the live mounted model", () => {
    expect(editor).toContain("shouldAcceptMountedEditorChange");
    expect(editor).toContain("liveModelValue");
    expect(editor).toContain("eventValue: next");
    expect(editor).toContain(
      "return args.eventValue === args.liveModelValue",
    );
  });
});
