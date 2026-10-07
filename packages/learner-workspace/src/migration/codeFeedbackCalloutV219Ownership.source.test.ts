import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("V219 CodeFeedbackCallout shared ownership", () => {
  it("exports the canonical shared owner", () => {
    const pkg = JSON.parse(
      source("packages/learner-workspace/package.json"),
    ) as { exports?: Record<string, string> };

    expect(pkg.exports?.["./components/practice/kinds/CodeFeedbackCallout"]).toBe(
      "./src/components/practice/kinds/CodeFeedbackCallout.tsx",
    );
  });

  it("keeps tagged resolution in app adapters", () => {
    const student = source("apps/student/src/legacy-web/components/practice/kinds/CodeFeedbackCallout.tsx");
    const web = source("apps/web/src/components/practice/kinds/CodeFeedbackCallout.tsx");

    expect(student).toContain("@zoeskoul/learner-workspace/components/practice/kinds/CodeFeedbackCallout");
    expect(web).toContain("@zoeskoul/learner-workspace/components/practice/kinds/CodeFeedbackCallout");
    expect(student).toContain('from "@student/i18n/tagged"');
    expect(web).toContain('from "@/i18n/tagged"');

    for (const adapter of [student, web]) {
      expect(adapter).toContain("const tagged = useTaggedT()");
      expect(adapter).toContain(
        "resolveText={(value) => tagged.resolve(value, value)}",
      );
    }
  });

  it("keeps the shared owner app/framework free", () => {
    const shared = source("packages/learner-workspace/src/components/practice/kinds/CodeFeedbackCallout.tsx");

    expect(shared).toContain("resolveText:");
    expect(shared.match(/resolveText\(/g)?.length).toBe(2);
    expect(shared).not.toContain("useTaggedT");
    expect(shared).not.toContain("next-intl");
    expect(shared).not.toContain("@student/");
    expect(shared).not.toContain('from "@/');
    expect(shared).not.toContain("@zoeskoul/learner-workspace/");
  });

  it("preserves raw-value fallback at the app edge", () => {
    const student = source("apps/student/src/legacy-web/components/practice/kinds/CodeFeedbackCallout.tsx");
    const web = source("apps/web/src/components/practice/kinds/CodeFeedbackCallout.tsx");

    for (const adapter of [student, web]) {
      expect(adapter).toContain("tagged.resolve(value, value)");
    }
  });
});
