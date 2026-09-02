import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("homepage SEO ownership", () => {
  const page = read("src/app/(public)/[locale]/(learningZone)/page.tsx");
  const client = read("src/components/home/onboarding/HomePageAvatarOnboardingClient.tsx");
  const builder = read("src/lib/seo/buildMetadata.ts");
  const publicRoutes = read("src/lib/seo/publicRoutes.ts");

  it("reuses the canonical SEO helper pipeline", () => {
    expect(page).toContain('import { buildMetadata } from "@/lib/seo/buildMetadata";');
    expect(page).toContain('import { getRouteSeo, getSharedSeo } from "@/lib/seo/getSeo";');
    expect(page).toContain('const seo = await getRouteSeo(l, "home");');
    expect(page).toContain("const shared = await getSharedSeo(l);");
    expect(page).toContain("return buildMetadata({");
    expect(page).toContain('path: "/",');
    expect(page).toContain("keywords: shared.keywords,");
    expect(page).toContain("imageAlt: shared.defaultOgAlt,");
    expect(builder).toContain("canonical: localized");
    expect(builder).toContain("languages");
    expect(builder).toContain("robots");
    expect(builder).toContain("openGraph");
    expect(builder).toContain("twitter");
    expect(publicRoutes).toContain("ROUTES.home");
  });

  it("uses the marketing homepage as the default public render", () => {
    expect(client).toContain("const [bootstrapped, setBootstrapped] = useState(false);");
    expect(client).toContain("const showOnboardingGate =");
    expect(client).toContain("bootstrapped && (showOnboarding || Boolean(pendingLocaleSwitch));");
    expect(client).toContain("const showHomeContent = !showOnboardingGate;");
    expect(client).not.toContain("const showEntryGate =");
    expect(client).not.toContain('key="entry-gate"');
    expect(client).not.toContain('key="gate-loading"');
    expect(client).toContain("const openOnboardingFlow = () => {");
    expect(client).toContain("onClick={reopenAssistant}");
  });

  it("does not create crawler-specific or parallel SEO", () => {
    expect(client.toLowerCase()).not.toContain("googlebot");
    expect(page.toLowerCase()).not.toContain("googlebot");
    expect(page).not.toContain("buildHomeMetadata");
    expect(page).not.toContain("seoMetadataV2");
    expect(page).not.toContain("landingPageSeo");
  });
});
