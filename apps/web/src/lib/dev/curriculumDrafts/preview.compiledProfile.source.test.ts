import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const previewSource = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "apps/web/src/lib/dev/curriculumDrafts/preview.ts",
  ),
  "utf8",
);

describe("Draft QA compiled profile ownership", () => {
  it("uses the profile emitted by the canonical-source compiler adapter", () => {
    expect(previewSource).toContain("loadSourceModuleTopics(ref)");
    expect(previewSource).toContain("profileId: draftModule.profileId");
    expect(previewSource).not.toContain("loadDraftSubjectManifest");
  });

  it("does not infer profile identity from catalog or subject names", () => {
    expect(previewSource).not.toContain("draftPreviewProfileId(");
    expect(previewSource).not.toContain(
      'normalizedCatalog === "web"',
    );
    expect(previewSource).not.toContain(
      'normalizedSubject === "html"',
    );
  });
});
