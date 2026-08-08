import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) =>
  fs.readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

const exists = (relativePath: string) =>
  fs.existsSync(fileURLToPath(new URL(relativePath, import.meta.url)));

describe("UserMenuChrome ownership boundary", () => {
  it("keeps framework and app wiring out of shared presentation", () => {
    const source = readSource("./UserMenuChrome.tsx");

    for (const forbidden of [
      "next/image",
      "next-intl",
      "next/navigation",
      "next-auth",
      "useTranslations",
      "useSession",
      "useStudentSession",
      "@/i18n",
      "@student/",
    ]) {
      expect(source).not.toContain(forbidden);
    }

    for (const required of [
      'document.addEventListener("mousedown", onDown)',
      'document.addEventListener("keydown", onKey)',
      'if (e.key === "Escape") setOpen(false)',
      '"absolute right-0 top-full z-50 mt-2 w-[240px] transition-all"',
      '"ui-surface-floating overflow-hidden"',
      'profileHref = "/profile"',
      'progressHref = "#"',
    ]) {
      expect(source).toContain(required);
    }
  });

  it("keeps Next/i18n/link wiring in each app adapter", () => {
    const web = readSource("../../../apps/web/src/components/UserMenuSlick.tsx");
    const student = readSource(
      "../../../apps/student/src/components/chrome/StudentUserMenuSlick.tsx",
    );

    for (const source of [web, student]) {
      expect(source).toContain('from "next/image"');
      expect(source).toContain('from "next-intl"');
      expect(source).toContain(
        'import { UserMenuChrome } from "@zoeskoul/learner-ui";',
      );
      expect(source).toContain('useTranslations("UserMenu")');
      expect(source).toContain("<UserMenuChrome");
      expect(source).toContain('alt={t("avatarAlt", { name })}');
    }
    expect(web).toContain('from "@/i18n/navigation"');
    expect(student).toContain('from "@student/i18n/navigation"');
  });

  it("moves Student adapter out of legacy ownership", () => {
    expect(
      exists("../../../apps/student/src/legacy-web/components/UserMenuSlick.tsx"),
    ).toBe(false);
    expect(
      exists("../../../apps/student/src/components/chrome/StudentUserMenuSlick.tsx"),
    ).toBe(true);
  });
});
