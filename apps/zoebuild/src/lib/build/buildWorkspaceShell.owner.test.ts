import { fileURLToPath as ownerTestFileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("ZoeBuild workspace ownership", () => {
  it("reuses the canonical shared FullIDE", () => {
    const source = readFileSync(
      resolve(
        ownerTestFileURLToPath(new URL("../../../../../", import.meta.url)),
        "apps/zoebuild/src/app/[locale]/projects/[buildProjectId]/BuildWorkspaceClient.tsx",
      ),
      "utf8",
    );

    expect(source).toContain(
      'from "@zoeskoul/learner-workspace/fullide/FullIDE"',
    );
    expect(source).not.toContain("@/components/ide/fullide/FullIDE");
    expect(source).not.toContain("apps/web");
  });
});
