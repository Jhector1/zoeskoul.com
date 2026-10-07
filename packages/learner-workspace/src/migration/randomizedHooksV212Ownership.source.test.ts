import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const hooks = [
  {
    symbol: "useRandomizedIdOrder",
    exportKey: "./components/practice/kinds/_shared/useRandomizedIdOrder",
    exportTarget: "./src/components/practice/kinds/_shared/useRandomizedIdOrder.ts",
    packageSpec: "@zoeskoul/learner-workspace/components/practice/kinds/_shared/useRandomizedIdOrder",
    shared: "packages/learner-workspace/src/components/practice/kinds/_shared/useRandomizedIdOrder.ts",
    student: "apps/student/src/legacy-web/components/practice/kinds/_shared/useRandomizedIdOrder.ts",
    web: "apps/web/src/components/practice/kinds/_shared/useRandomizedIdOrder.ts",
  },
  {
    symbol: "useRandomizedOptions",
    exportKey: "./components/practice/kinds/_shared/useRandomizedOptions",
    exportTarget: "./src/components/practice/kinds/_shared/useRandomizedOptions.ts",
    packageSpec: "@zoeskoul/learner-workspace/components/practice/kinds/_shared/useRandomizedOptions",
    shared: "packages/learner-workspace/src/components/practice/kinds/_shared/useRandomizedOptions.ts",
    student: "apps/student/src/legacy-web/components/practice/kinds/_shared/useRandomizedOptions.ts",
    web: "apps/web/src/components/practice/kinds/_shared/useRandomizedOptions.ts",
  },
] as const;

const consumers = [
  {
    symbol: "useRandomizedIdOrder",
    target: "./_shared/useRandomizedIdOrder",
    shared: "packages/learner-workspace/src/components/practice/kinds/DragReorderExerciseUI.tsx",
  },
  {
    symbol: "useRandomizedOptions",
    target: "./_shared/useRandomizedOptions",
    shared: "packages/learner-workspace/src/components/practice/kinds/FillBlankChoiceExerciseUI.tsx",
  },
  {
    symbol: "useRandomizedOptions",
    target: "./_shared/useRandomizedOptions",
    shared: "packages/learner-workspace/src/components/practice/kinds/MultiChoiceExerciseUI.tsx",
  },
] as const;

describe("V212 randomized hook shared ownership", () => {
  it.each(hooks)("$symbol is exported by learner-workspace", (item) => {
    const pkg = JSON.parse(
      source("packages/learner-workspace/package.json"),
    ) as { exports?: Record<string, string> };

    expect(pkg.exports?.[item.exportKey]).toBe(
      item.exportTarget,
    );
  });

  it.each(hooks)("$symbol leaves identical thin app adapters", (item) => {
    const student = source(item.student);
    const web = source(item.web);

    expect(student).toBe(web);
    expect(student).toContain(item.packageSpec);
    expect(student).toContain(item.symbol);
    expect(student.split("\n").filter(Boolean).length)
      .toBeLessThanOrEqual(3);
  });

  it.each(hooks)("$symbol shared owner uses only relative presentationOrder", (item) => {
    const shared = source(item.shared);

    expect(shared).toContain(item.symbol);
    expect(shared).toContain(
      "../../../../lib/practice/presentationOrder",
    );
    expect(shared).not.toContain("@/lib");
    expect(shared).not.toContain("@student/");
    expect(shared).not.toContain(
      "@zoeskoul/learner-workspace/",
    );
  });

  it.each(consumers)("$symbol consumer imports canonical hook", (item) => {
    const shared = source(item.shared);

    expect(shared).toContain(
      `import { ${item.symbol} } from "${item.target}";`,
    );
    expect(shared).not.toContain(
      `import { ${item.symbol} } from "../../../lib/practice/presentationOrder";`,
    );
  });

  it("preserves the V207 prompt bridge", () => {
    const bridge = source(
      "packages/learner-workspace/src/components/practice/kinds/ExercisePromptBridge.tsx",
    );

    expect(bridge).toContain("ExercisePromptProvider");
    expect(bridge).not.toContain("next-intl");
    expect(bridge).not.toContain("useTaggedT");
  });
});
