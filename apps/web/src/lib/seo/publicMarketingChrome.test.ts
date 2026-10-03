import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WEB_ROOT = path.resolve(process.cwd());

function read(relativePath: string) {
  return fs.readFileSync(path.join(WEB_ROOT, relativePath), "utf8");
}

describe("public marketing chrome and SEO bundles", () => {
  it("defines sandbox-programming SEO metadata in every supported public locale", () => {
    for (const locale of ["en", "fr", "ht"] as const) {
      const bundle = JSON.parse(
        read(`src/i18n/messages/${locale}/seo/metadata.json`),
      ) as { seo?: { routes?: Record<string, unknown> } };

      expect(bundle.seo?.routes?.["sandbox-programming"]).toBeTruthy();
    }
  });

  it("uses one shared public site shell for marketing pages and the sandbox discovery landing", () => {
    const shell = read("src/components/marketing/PublicSiteShell.tsx");
    const marketingLayout = read(
      "src/app/(public)/[locale]/(marketing)/layout.tsx",
    );
    const sandboxLanding = read(
      "src/app/(public)/[locale]/(learningZone)/sandbox/[category]/page.tsx",
    );
    const sandboxTool = read(
      "src/app/(public)/[locale]/(learningZone)/sandbox/[category]/[toolSlug]/page.tsx",
    );

    expect(shell).toContain('import HeaderSlick from "@/components/HeaderSlick"');
    expect(shell).toContain('import FooterSlick from "@/components/layout/FooterSlick"');
    expect(shell).toContain("<HeaderSlick isBillingStatus={false}");
    expect(marketingLayout).toContain("<PublicSiteShell>");
    expect(sandboxLanding).toContain('<PublicSiteShell badge="Sandbox">');
    expect(sandboxTool).not.toContain("PublicSiteShell");
  });
});
