import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("migration integration boundaries", () => {
  it("preserves PracticeMobileSheet default and named exports", () => {
    const web = source(
      "apps/web/src/components/practice/shell/PracticeMobileSheet.tsx",
    );
    const student = source(
      "apps/student/src/legacy-web/components/practice/shell/PracticeMobileSheet.tsx",
    );

    expect(web).toBe(student);
    expect(web).toContain('export { default } from "@zoeskoul/learner-workspace/practice/shell/PracticeMobileSheet"');
    expect(web).toContain('export * from "@zoeskoul/learner-workspace/practice/shell/PracticeMobileSheet"');
  });

  it("keeps excuse helpers structural instead of binding to practice-contracts QItem", () => {
    const excuse = source(
      "packages/learner-ui/src/lib/flow/excuse.ts",
    );

    expect(excuse).not.toContain(
      'import type { QItem } from "@zoeskoul/practice-contracts"',
    );
    expect(excuse).toContain(
      "export type ExcusablePracticeItem",
    );
    expect(excuse).toContain(
      "export function excusePracticeItem<T extends ExcusablePracticeItem>",
    );
  });

  it("keeps usePracticeExcuseActions generic over the caller item type", () => {
    const hook = source(
      "packages/learner-workspace/src/lib/flow/usePracticeExcuseActions.ts",
    );

    expect(hook).not.toContain(
      'import type { QItem } from "@zoeskoul/practice-contracts"',
    );
    expect(hook).toContain(
      "export function usePracticeExcuseActions<TItem extends ExcusablePracticeItem>",
    );
    expect(hook).toContain(
      "setStack: (updater: (prev: TItem[]) => TItem[]) => void;",
    );
  });
});
