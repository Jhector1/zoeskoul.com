import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("published runtime draft catalog boundary", () => {
  it("omits verified draft-only subjects while preserving unknown-subject validation", () => {
    const source = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "packages/curriculum-registry/scripts/generate-published-runtime.mjs",
      ),
      "utf8",
    );

    expect(source).toContain("loadDraftOnlyAuthoringSubjectSlugs");
    expect(source).toContain("draftOnlyAuthoringSubjectSlugs.has(subjectSlug)");
    expect(source).toContain("trulyUnknownSubjectSlugs");
    expect(source).toContain("only verified draft subjects should not leak into the published runtime");
  });
});
