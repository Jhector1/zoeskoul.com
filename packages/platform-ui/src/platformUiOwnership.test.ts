import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repo = resolve(__dirname, "../../..");

function source(path: string) {
  return readFileSync(resolve(repo, path), "utf8");
}

describe("platform UI ownership", () => {
  it("owns neutral application chrome outside learner-ui", () => {
    const files = [
      "packages/platform-ui/src/HeaderChrome.tsx",
      "packages/platform-ui/src/LocaleSwitcherChrome.tsx",
      "packages/platform-ui/src/ThemeToggle.tsx",
      "packages/platform-ui/src/UserMenuChrome.tsx",
      "packages/platform-ui/src/ZoeSkoulLogoMark.tsx",
    ];

    for (const file of files) {
      const value = source(file);
      expect(value).not.toContain("@student/");
      expect(value).not.toContain("apps/web");
      expect(value).not.toContain("LearnerHeader");
    }
  });

  it("keeps learner-ui as compatibility re-exports", () => {
    for (const file of [
      "HeaderChrome.tsx",
      "LocaleSwitcherChrome.tsx",
      "ThemeToggle.tsx",
      "UserMenuChrome.tsx",
      "ZoeSkoulLogoMark.tsx",
    ]) {
      expect(
        source(`packages/learner-ui/src/${file}`),
      ).toContain("@zoeskoul/platform-ui");
    }
  });

  it("shares preference-driven theme behavior", () => {
    const value =
      source("packages/platform-ui/src/AppThemeProvider.tsx");

    expect(value).toContain(
      'from "@zoeskoul/preferences/react"',
    );
    expect(value).toContain("forcedTheme={theme}");
    expect(value).toContain("enableSystem={false}");
  });
});
