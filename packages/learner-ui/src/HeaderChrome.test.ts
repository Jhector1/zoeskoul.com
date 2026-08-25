import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) =>
  fs.readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );

describe("HeaderChrome ownership boundary", () => {
  it("keeps the shared chrome framework-neutral", () => {
    const source = readSource("./HeaderChrome.tsx");

    for (const forbidden of [
      "next-auth",
      "next/navigation",
      "next-intl",
      "useSession",
      "useStudentSession",
      "buildStudentAppHref",
      "buildWebLogoutUrl",
      "buildStudentLogoutUrl",
      "VITE_WEBSITE_ORIGIN",
      "@/",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("owns the exact shared header geometry", () => {
    const source = readSource("./HeaderChrome.tsx");

    for (const required of [
      'className="sticky top-0 z-50"',
      '"border-b border-neutral-200/80 bg-white/90 backdrop-blur dark:border-white/10 dark:bg-neutral-950/85"',
      'className="mx-auto px-4 md:px-6"',
      'className="flex h-16 min-w-0 items-center gap-2 sm:gap-3 lg:gap-4"',
      'className="hidden min-w-0 flex-1 justify-center xl:flex"',
      'data-ai-tutor-header-slot="true"',
      'className="xl:hidden -mt-1 pb-2"',
      'className="ui-surface-muted px-2 py-2"',
    ]) {
      expect(source).toContain(required);
    }
  });

  it("keeps one canonical presentation owner and app-specific adapters", () => {
    const shared = readSource("./LearnerHeaderSlick.tsx");
    const web = readSource(
      "../../../apps/web/src/components/HeaderSlick.tsx",
    );
    const student = readSource(
      "../../../apps/student/src/components/chrome/StudentHeaderSlick.tsx",
    );

    expect(shared).toContain(
      'import { HeaderChrome } from "./HeaderChrome";',
    );
    expect(shared).toContain("<HeaderChrome");
    expect(shared).toContain("const brandGroup = (");
    expect(shared).toContain("const topRowActions = (");
    expect(shared).toContain("const mobileMenu = (");

    for (const source of [web, student]) {
      expect(source).toContain("createLearnerHeader({");
      expect(source).not.toContain("<HeaderChrome");
      expect(source).not.toContain("const brandGroup = (");
      expect(source).not.toContain("const topRowActions = (");
      expect(source).not.toContain("const mobileMenu = (");
      expect(source).not.toContain(
        '<header className="sticky top-0 z-50">',
      );
    }

    expect(web).toContain("useSession()");
    expect(web).toContain("buildStudentAppHref");
    expect(web).toContain("buildWebLogoutUrl");

    expect(student).toContain("useStudentSession()");
    expect(student).toContain("buildStudentLogoutUrl");
    expect(student).toContain("VITE_WEBSITE_ORIGIN");
  });
});
