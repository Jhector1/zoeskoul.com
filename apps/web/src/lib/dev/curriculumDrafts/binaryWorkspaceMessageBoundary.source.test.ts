import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("code profile binary workspace message boundary", () => {
  it("does not replace binary file content with i18n message tags", () => {
    const source = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "packages/curriculum-profiles/src/families/code/createCompiledLanguageProfile.ts",
      ),
      "utf8",
    );

    expect(
      source.match(/content: file\.encoding === "base64"/g),
    ).toHaveLength(2);
    expect(source).toContain('? ""');
    expect(source).toContain("starterFileContentMessageTag");
    expect(source).toContain("solutionFileContentMessageTag");
  });
});
