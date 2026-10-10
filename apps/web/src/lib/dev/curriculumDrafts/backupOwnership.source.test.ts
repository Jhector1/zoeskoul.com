import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "apps/web/src/lib/dev/curriculumDrafts/fs.ts",
  ),
  "utf8",
);

describe("curriculum draft backup ownership", () => {
  it("backs up canonical source beside the active compiled build root", () => {
    const start = source.indexOf(
      "export async function backupDraftSubject",
    );
    const end = source.indexOf(
      "export async function writeDraftJsonFile",
      start,
    );
    const block = source.slice(start, end);

    expect(block).toContain("const buildRoot = await findDraftRoot()");
    expect(block).toContain('path.dirname(buildRoot), ".curriculum-drafts"');
    expect(block).toContain('safeJoin(repoRoot, ".curriculum-drafts")');
    expect(block).not.toContain('".curriculum-build"');
  });

  it("copies only the canonical subject source tree", () => {
    const start = source.indexOf(
      "export async function backupDraftSubject",
    );
    const end = source.indexOf(
      "export async function writeDraftJsonFile",
      start,
    );
    const block = source.slice(start, end);

    expect(block).toContain("sourceSubjectRoot");
    expect(block).toContain("await fs.cp(sourceSubjectRoot, backupPath");
    expect(block).not.toContain('"messages"');
    expect(block).not.toContain("subject.manifest.json");
  });

  it("keeps compiled curriculum build artifacts read-only", () => {
    expect(source).toContain(
      "Compiled curriculum build artifacts are read-only.",
    );
  });
});
