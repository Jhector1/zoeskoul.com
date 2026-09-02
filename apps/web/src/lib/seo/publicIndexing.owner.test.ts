import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROUTES } from "@zoeskoul/app-config";
import { describe, expect, it } from "vitest";

import sitemap from "@/app/sitemap";
import { LEGAL_INDEX } from "@/lib/legal/content";
import {
  PUBLIC_INDEXABLE_ROUTES,
  PUBLIC_NOINDEX_ROUTES,
} from "@/lib/seo/publicRoutes";
import { LOCALES } from "@/lib/seo/site";
import {
  MATH_TOOL_ORDER,
  PROGRAMMING_TOOL_ORDER,
  PUBLIC_SANDBOX_TOOL_PATHS,
} from "@/lib/sandbox/toolRegistry";

function localized(locale: string, path: string) {
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

function source(relative: string) {
  return readFileSync(resolve(process.cwd(), relative), "utf8");
}

describe("public indexing manifest", () => {
  it("keeps static public routes in the existing public route owner", () => {
    expect(PUBLIC_INDEXABLE_ROUTES).toContain(ROUTES.home);
    expect(PUBLIC_INDEXABLE_ROUTES).toContain(ROUTES.pricing);
    expect(PUBLIC_INDEXABLE_ROUTES).toContain(ROUTES.contact);
    expect(PUBLIC_INDEXABLE_ROUTES).toContain("/legal");
    expect(PUBLIC_INDEXABLE_ROUTES).toContain(ROUTES.sandbox);

    expect(PUBLIC_INDEXABLE_ROUTES).not.toContain(ROUTES.privacy);
    expect(PUBLIC_INDEXABLE_ROUTES).not.toContain(ROUTES.terms);
    expect(PUBLIC_NOINDEX_ROUTES).not.toContain(ROUTES.sandbox);
  });

  it("derives public Sandbox sitemap paths from the existing Sandbox registry owner", () => {
    expect(PUBLIC_SANDBOX_TOOL_PATHS).toEqual([
      ...PROGRAMMING_TOOL_ORDER.map(
        (toolSlug) => `/sandbox/programming/${toolSlug}`,
      ),
      ...MATH_TOOL_ORDER.map(
        (toolSlug) => `/sandbox/math/${toolSlug}`,
      ),
    ]);

    expect(PUBLIC_SANDBOX_TOOL_PATHS).not.toContain(
      "/sandbox/programming/shell",
    );
  });

  it("submits every localized public static, legal, and Sandbox tool URL", () => {
    const paths = sitemap().map((entry) => new URL(entry.url).pathname);

    for (const locale of LOCALES) {
      for (const path of PUBLIC_INDEXABLE_ROUTES) {
        expect(paths).toContain(localized(locale, path));
      }

      for (const doc of LEGAL_INDEX) {
        expect(paths).toContain(`/${locale}/legal/${doc.slug}`);
      }

      for (const path of PUBLIC_SANDBOX_TOOL_PATHS) {
        expect(paths).toContain(localized(locale, path));
      }

      expect(paths).not.toContain(`/${locale}${ROUTES.privacy}`);
      expect(paths).not.toContain(`/${locale}${ROUTES.terms}`);
      expect(paths).not.toContain(`/${locale}/sandbox/programming/shell`);
    }
  });

  it("uses the existing metadata helpers for public legal and Sandbox pages", () => {
    const legalPage = source(
      "src/app/(public)/[locale]/(legal)/legal/[slug]/page.tsx",
    );
    const sandboxHub = source(
      "src/app/(public)/[locale]/(playground)/sandbox/page.tsx",
    );
    const sandboxTool = source(
      "src/app/(public)/[locale]/(learningZone)/sandbox/[category]/[toolSlug]/page.tsx",
    );

    expect(legalPage).toContain(
      'import { buildMetadata } from "@/lib/seo/buildMetadata";',
    );
    expect(legalPage).toContain(
      'import { getRouteSeo, getSharedSeo } from "@/lib/seo/getSeo";',
    );
    expect(legalPage).toContain(
      "const seo = await getRouteSeo(l, slug as SeoRouteKey);",
    );
    expect(legalPage).toContain("return buildMetadata({");

    expect(sandboxHub).toContain("noIndex: false");

    expect(sandboxTool).toContain(
      'const seo = await getRouteSeo(l, entry.seoKey);',
    );
    expect(sandboxTool).toContain('entry.toolSlug === "shell"');
  });
});
