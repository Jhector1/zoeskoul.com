import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("V227 CodeInput boundary contracts", () => {
  it("matches tagged translator value types", () => {
    const bridge = source("packages/learner-workspace/src/components/practice/kinds/CodeInputI18nBridge.tsx");

    expect(bridge).toContain(
      "Record<string, string | number | Date>",
    );
    expect(bridge).not.toContain(
      "Record<string, unknown>",
    );
  });

  it("declares curriculum-runtime as a direct learner-workspace dependency", () => {
    const pkg = JSON.parse(source("packages/learner-workspace/package.json")) as { dependencies?: Record<string, string> };

    expect(pkg.dependencies?.["@zoeskoul/curriculum-runtime"]).toBeTruthy();
  });

  it("keeps the SQL runtime dependency explicit in shared CodeInput", () => {
    const shared = source("packages/learner-workspace/src/components/practice/kinds/CodeInputExerciseUI.tsx");

    expect(shared).toContain("@zoeskoul/curriculum-runtime/subjects/sql/sql/runtime/resolveSqlRunnerConfig");
    expect(shared).not.toContain("next-intl");
    expect(shared).not.toContain("useTaggedT");
    expect(shared).not.toContain('from "@/');
  });
});
