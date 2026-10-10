import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("topic bundle binary workspace invariant", () => {
  it("canonicalizes every base64 workspace file before a freshly built topic bundle leaves the emitter", () => {
    const source = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "packages/curriculum-compiler/src/emit/buildTopicBundleFromDraft.ts",
      ),
      "utf8",
    );

    expect(source).toContain(
      "function canonicalizeBinaryWorkspaceFileContent",
    );
    expect(source).toContain('record.encoding === "base64"');
    expect(source).toContain('record.content = "";');
    expect(
      source.match(/canonicalizeBinaryWorkspaceFileContent\(exercise\);/g),
    ).toHaveLength(1);
  });

  it("sanitizes binary files when rebuilding from pre-existing current output", () => {
    const source = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "packages/curriculum-compiler/src/compile/rebuildSubjectFromDraftReports.ts",
      ),
      "utf8",
    );

    expect(source).toContain(
      "function normalizeCurrentOutputVisibleStarterFileContentRefs",
    );
    expect(source).toContain(
      "function normalizeCurrentOutputSolutionFileContentRefs",
    );
    expect(source).toContain(
      "function normalizeCurrentOutputEntryStarterFileRefs",
    );

    expect(
      source.match(/entry\.encoding === "base64"/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(2);
    expect(
      source.match(/entry\.content = "";/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(2);

    expect(source).toContain('file.encoding === "base64"');
    expect(source).toContain('file.content = "";');
  });
});
