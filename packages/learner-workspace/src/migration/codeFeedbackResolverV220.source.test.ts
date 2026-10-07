import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("V220 CodeFeedback resolver contract", () => {
  it("narrows the shared resolver to the values actually supplied", () => {
    const shared = source("packages/learner-workspace/src/components/practice/kinds/CodeFeedbackCallout.tsx");

    expect(shared).toContain("value: string | undefined,");
    expect(shared).toContain(") => string;");
    expect(shared).not.toContain("value: string | null | undefined,");
  });

  it("preserves the tagged fallback bridge in both app adapters", () => {
    const student = source("apps/student/src/legacy-web/components/practice/kinds/CodeFeedbackCallout.tsx");
    const web = source("apps/web/src/components/practice/kinds/CodeFeedbackCallout.tsx");

    for (const adapter of [student, web]) {
      expect(adapter).toContain("resolveText={(value) => tagged.resolve(value, value)}");
    }
  });

  it("keeps tagged/i18n dependencies out of the shared owner", () => {
    const shared = source("packages/learner-workspace/src/components/practice/kinds/CodeFeedbackCallout.tsx");

    expect(shared).not.toContain("useTaggedT");
    expect(shared).not.toContain("next-intl");
    expect(shared).not.toContain("tagged.resolve");
  });
});
