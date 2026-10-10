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

const fsSource = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "apps/web/src/lib/dev/curriculumDrafts/fs.ts",
  ),
  "utf8",
);

describe("Draft QA compiled profile ownership", () => {
  it("loads the compiler-emitted subject manifest through the shared fs owner", () => {
    expect(fsSource).toContain(
      "export async function loadDraftSubjectManifest",
    );
    expect(previewSource).toContain(
      "const subjectManifest = await loadDraftSubjectManifest({",
    );
  });

  it("uses subject.profileId and fails closed when it is missing", () => {
    expect(previewSource).toContain(
      "asRecord(subjectManifest.subject)?.profileId",
    );
    expect(previewSource).toContain(
      "Draft subject manifest is missing subject.profileId",
    );
    expect(previewSource).toContain(
      "Recompile the draft curriculum before previewing it.",
    );
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
