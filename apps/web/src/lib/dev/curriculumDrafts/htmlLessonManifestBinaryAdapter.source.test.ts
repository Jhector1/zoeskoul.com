import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "../..");
const resolver = fs.readFileSync(
  path.join(
    repoRoot,
    "packages/learning-runtime/src/review/module/runtime/resolveWorkspaceForTarget.ts",
  ),
  "utf8",
);

describe("HTML Lesson manifest binary adapter", () => {
  it("adapts the compiled top-level binary contract before runtime resolution", () => {
    expect(resolver).toContain("MANIFEST_BINARY_ADAPTER_V284AD");
    expect(resolver).toContain('record.encoding === "base64"');
    expect(resolver).toContain("data: record.data");
    expect(resolver).toContain("binary: { ...binary }");
  });

  it("runs the adapter immediately after createManifestWorkspaceDefinition", () => {
    const createIndex = resolver.indexOf(
      "const manifestDefinition = createManifestWorkspaceDefinition({",
    );
    const hydrateIndex = resolver.indexOf(
      "const hydratedManifestWorkspace = hydrateManifestWorkspaceBinaryFiles({",
    );
    const candidateIndex = resolver.indexOf(
      "const normalizedCandidates =",
      hydrateIndex,
    );

    expect(createIndex).toBeGreaterThanOrEqual(0);
    expect(hydrateIndex).toBeGreaterThan(createIndex);
    expect(candidateIndex).toBeGreaterThan(hydrateIndex);
  });
});
