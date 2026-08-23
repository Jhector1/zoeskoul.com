import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "../..");

describe("Admin / Teacher domain ownership", () => {
  it("does not classify teaching browser components as Admin components", () => {
    for (const relative of [
      "apps/web/src/components/admin/course-assignments",
      "apps/web/src/components/admin/invitations",
      "apps/web/src/components/admin/learning-groups",
      "apps/web/src/components/admin/tutoring-sessions",
    ]) {
      expect(existsSync(resolve(root, relative))).toBe(false);
    }

    for (const relative of [
      "apps/web/src/components/teaching/course-assignments",
      "apps/web/src/components/teaching/invitations",
      "apps/web/src/components/teaching/learning-groups",
      "apps/web/src/components/teaching/tutoring-sessions",
    ]) {
      expect(existsSync(resolve(root, relative))).toBe(true);
    }
  });

  it("has one canonical Teacher API implementation namespace", () => {
    for (const domain of [
      "course-assignments",
      "learning-groups",
      "tutoring-sessions",
    ]) {
      expect(
        existsSync(
          resolve(root, `apps/web/src/app/api/teacher/${domain}`),
        ),
      ).toBe(true);

      const alias = readFileSync(
        resolve(root, `apps/web/src/app/api/admin/${domain}/route.ts`),
        "utf8",
      );

      expect(alias).toContain("Compatibility alias only");
      expect(alias).toContain("@/app/api/teacher/");
      expect(alias).not.toContain("prisma.");
    }
  });

  it("keeps the real platform assignment library in the Admin server domain", () => {
    expect(
      existsSync(
        resolve(root, "apps/web/src/app/api/admin/assignments/route.ts"),
      ),
    ).toBe(true);
  });

  it("moves curriculum browser ownership to Admin but leaves filesystem authority in Web", () => {
    expect(
      existsSync(
        resolve(
          root,
          "apps/admin/src/features/curriculum/CurriculumDraftsPage.tsx",
        ),
      ),
    ).toBe(true);

    expect(
      existsSync(
        resolve(root, "apps/web/src/lib/dev/curriculumDrafts/fs.ts"),
      ),
    ).toBe(true);

    const compatibilityPage = readFileSync(
      resolve(
        root,
        "apps/web/src/app/(public)/[locale]/dev/curriculum-drafts/page.tsx",
      ),
      "utf8",
    );

    expect(compatibilityPage).toContain("redirect(");
    expect(compatibilityPage).not.toContain(
      'import CurriculumDraftEditor',
    );
    expect(compatibilityPage).not.toContain(
      'from "@/components/dev/curriculum-drafts/CurriculumDraftEditor"',
    );
    expect(compatibilityPage).not.toContain("<CurriculumDraftEditor");
  });
});
