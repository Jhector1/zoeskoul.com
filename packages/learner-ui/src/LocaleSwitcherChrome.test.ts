import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) =>
  fs.readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );

const exists = (relativePath: string) =>
  fs.existsSync(fileURLToPath(new URL(relativePath, import.meta.url)));

describe("LocaleSwitcherChrome ownership boundary", () => {
  it("keeps locale routing and persistence out of shared presentation", () => {
    const source = readSource("./LocaleSwitcherChrome.tsx");

    for (const forbidden of [
      "next-intl",
      "next/navigation",
      "next-auth",
      "useLocale",
      "useTranslations",
      "useRouter",
      "usePathname",
      "useSearchParams",
      "router.replace",
      "persistLocale",
      "ConfirmResetModal",
      "GlobalNavigationProgress",
      "window.location",
      "@/i18n",
      "@student/",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("owns the exact locale switcher chrome and pending presentation", () => {
    const source = readSource("./LocaleSwitcherChrome.tsx");

    for (const required of [
      '"relative max-w-full"',
      '"inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"',
      '"absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-md bg-white/92 text-neutral-900 dark:bg-neutral-950/92 dark:text-white"',
      '"inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-md border border-neutral-200 bg-white p-1 shadow-sm [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-white/10 dark:bg-neutral-900 dark:shadow-none"',
      '"ui-btn-ide-active"',
      '"ui-btn-ide-ghost"',
      '"min-w-[2.5rem] px-2"',
      '"min-w-[2.75rem] px-2.5"',
      "{confirmDialog}",
      "locales.map((l) =>",
      "onClick={() => onRequestChange(l)}",
    ]) {
      expect(source).toContain(required);
    }
  });

  it("keeps locale behavior in Web and Student adapters", () => {
    const web = readSource(
      "../../../apps/web/src/components/LocaleSwitcher.tsx",
    );
    const student = readSource(
      "../../../apps/student/src/components/chrome/StudentLocaleSwitcher.tsx",
    );

    for (const source of [web, student]) {
      for (const required of [
        'from "next-intl"',
        'from "@/i18n/navigation"',
        'from "next/navigation"',
        'from "@/i18n/routing"',
        'from "@/lib/locale/persistLocale"',
        'from "@/components/navigation/GlobalNavigationProgress"',
        'import { LocaleSwitcherChrome } from "@zoeskoul/learner-ui";',
        'useTranslations("LocaleSwitcher")',
        "useLocale()",
        "usePathname()",
        "useRouter()",
        "useSearchParams()",
        "persistLocale(nextLocale)",
        "startGlobalNavigationPending({",
        "window.location.hash",
        'router.replace(`${href}${hash}`, { locale: nextLocale });',
        "<ConfirmResetModal",
        "<LocaleSwitcherChrome",
      ]) {
        expect(source).toContain(required);
      }
    }
  });

  it("moves the Student adapter out of legacy ownership", () => {
    expect(
      exists(
        "../../../apps/student/src/legacy-web/components/LocaleSwitcher.tsx",
      ),
    ).toBe(false);
    expect(
      exists(
        "../../../apps/student/src/components/chrome/StudentLocaleSwitcher.tsx",
      ),
    ).toBe(true);
  });
});
