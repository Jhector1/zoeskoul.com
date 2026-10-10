import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("HTML Lesson canonical binary path ownership", () => {
  const resolver = read(
    "packages/learning-runtime/src/review/module/runtime/resolveWorkspaceForTarget.ts",
  );
  const runtime = read(
    "packages/learning-runtime/src/review/module/runtime/reviewRuntimeStore.ts",
  );
  const tools = read(
    "apps/web/src/components/review/module/context/ReviewToolsContext.tsx",
  );

  it("does not preserve text collisions at canonical binary paths", () => {
    expect(resolver).toContain("A canonical binary asset owns its path.");
    expect(runtime).toContain(
      "Canonical binary assets own their exact path.",
    );
  });

  it("makes incoming canonical binary authoritative during protected registration", () => {
    expect(tools).toContain("const incomingFiles = pathMap(args.incoming);");
    expect(tools).toContain('binary?.encoding !== "base64"');
    expect(tools).toContain('content: ""');
    expect(tools).toContain('binary: { ...binary }');
  });
});
