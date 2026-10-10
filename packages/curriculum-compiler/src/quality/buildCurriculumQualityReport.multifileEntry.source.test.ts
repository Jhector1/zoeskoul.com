import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("curriculum quality multi-file entry contract", () => {
  it("allows known alternate entry files by workspace capability, not profile name", () => {
    const source = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "packages/curriculum-compiler/src/quality/buildCurriculumQualityReport.ts",
      ),
      "utf8",
    );

    expect(source).toContain("function topicAllowsExplicitWorkspaceEntryFile");
    expect(source).not.toContain(
      'if (args.topic.seed.profileId !== "python") return false;',
    );
    expect(source).toContain("capabilities?.filesystem");
    expect(source).toContain("capabilities?.multiFileProjects");
    expect(source).toContain("knownWorkspacePaths.has(entryFilePath)");
    expect(source).toContain("explicitWorkspaceEntryFileAllowed");
  });
});
