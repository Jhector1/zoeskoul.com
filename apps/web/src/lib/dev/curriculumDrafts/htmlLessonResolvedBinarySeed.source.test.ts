import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "../..");
const runtime = fs.readFileSync(
  path.join(
    repoRoot,
    "packages/learning-runtime/src/review/module/runtime/reviewRuntimeStore.ts",
  ),
  "utf8",
);

describe("HTML Lesson resolved binary seed", () => {
  it("makes canonical binary authoritative during initial saved runtime restore", () => {
    expect(runtime).toContain("canonicalBinaryReplacements");
    expect(runtime).toContain("target.binary = { ...node.binary }");
    expect(runtime).toContain('target.content = ""');
  });

  it("includes binary payload in runtime semantic identity", () => {
    expect(runtime).toContain(
      'content: binary ? "" : String(node.content ?? "")',
    );
    expect(runtime).toContain("data: node.binary.data");
  });
});
