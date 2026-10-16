import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repo = resolve(__dirname, "../../../../..");

function source(path: string) {
  return readFileSync(resolve(repo, path), "utf8");
}

describe("ZoeBuild production chrome ownership", () => {
  it("uses neutral platform UI instead of learner product chrome", () => {
    const header =
      source("apps/zoebuild/src/components/chrome/ZoeBuildHeader.tsx");

    expect(header).toContain(
      'from "@zoeskoul/platform-ui"',
    );
    expect(header).not.toContain("createLearnerHeader");
    expect(header).not.toContain("LearningEntryButton");
    expect(header).not.toContain("PracticeEntryButton");
    expect(header).not.toContain("@student/");
    expect(header).not.toContain("apps/web");
  });

  it("uses shared preferences and app-config ownership", () => {
    const provider =
      source("apps/zoebuild/src/app/providers.tsx");
    const locale =
      source("apps/zoebuild/src/components/chrome/ZoeBuildLocaleSwitcher.tsx");
    const origins =
      source("apps/zoebuild/src/lib/appOrigins.ts");

    expect(provider).toContain("AppPreferencesProvider");
    expect(provider).toContain("AppThemeProvider");
    expect(locale).toContain("persistLocale");
    expect(origins).toContain('appId: "website"');
    expect(origins).toContain('appId: "zoebuild"');
  });

  it("registers ZoeBuild in the shared application registry", () => {
    const config =
      source("packages/app-config/src/index.ts");

    expect(config).toContain("zoebuild:");
    expect(config).toContain("localPort: 3004");
    expect(config).toContain(
      'productionOrigin: "https://build.zoeskoul.com"',
    );
  });
});
