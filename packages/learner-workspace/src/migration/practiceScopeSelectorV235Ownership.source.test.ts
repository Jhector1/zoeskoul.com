import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("V235A PracticeScopeSelector shared ownership", () => {
  it("moves the implementation into learner-workspace", () => {
    const shared = source("packages/learner-workspace/src/components/practice/shell/PracticeScopeSelector.tsx");

    expect(shared).toContain(
      "export default function PracticeScopeSelector",
    );
    expect(shared).toContain("usePracticeScopeSelectorBridge");
    expect(shared).toContain("pushRoute(");
    expect(shared).toContain(
      "const navigate = (nextSubject: string, nextModule: string) =>",
    );
    expect(shared.match(/resolveText\(/g)?.length).toBe(2);
  });

  it("keeps app framework hooks out of the shared owner", () => {
    const shared = source("packages/learner-workspace/src/components/practice/shell/PracticeScopeSelector.tsx");

    expect(shared).not.toContain("next/navigation");
    expect(shared).not.toContain("next-intl");
    expect(shared).not.toContain("useRouter");
    expect(shared).not.toContain("useTranslations");
    expect(shared).not.toContain("useTaggedT");
    expect(shared).not.toContain("@student/");
    expect(shared).not.toContain('from "@/');
  });

  it("leaves Student and Web as framework adapters", () => {
    const student = source("apps/student/src/legacy-web/components/practice/shell/PracticeScopeSelector.tsx");
    const web = source("apps/web/src/components/practice/shell/PracticeScopeSelector.tsx");

    for (const adapter of [student, web]) {
      expect(adapter).toContain("SharedPracticeScopeSelector");
      expect(adapter).toContain("PracticeScopeSelectorBridgeProvider");
      expect(adapter).toContain('from "next/navigation"');
      expect(adapter).toContain('from "next-intl"');
      expect(adapter).toContain("router.push(href, options)");
      expect(adapter.split("\n").length).toBeLessThan(35);
    }

    expect(student).toContain("@student/i18n/tagged");
    expect(web).toContain("@/i18n/tagged");
  });

  it("exports both the owner and bridge", () => {
    const pkg = JSON.parse(
      source("packages/learner-workspace/package.json"),
    ) as { exports?: Record<string, string> };

    expect(pkg.exports?.["./components/practice/shell/PracticeScopeSelector"]).toBe(
      "./src/components/practice/shell/PracticeScopeSelector.tsx",
    );
    expect(pkg.exports?.["./components/practice/shell/PracticeScopeSelectorBridge"]).toBe(
      "./src/components/practice/shell/PracticeScopeSelectorBridge.tsx",
    );
  });
});
