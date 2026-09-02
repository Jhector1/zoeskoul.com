import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getProductionAppOrigin } from "@zoeskoul/app-config";
import { describe, expect, it } from "vitest";

import { SITE_URL } from "./site";

function source(relative: string) {
    return readFileSync(resolve(process.cwd(), relative), "utf8");
}

describe("public SSR and canonical Website ownership", () => {
    it("pins SEO canonical URLs to the shared production Website origin", () => {
        expect(SITE_URL).toBe(getProductionAppOrigin("website"));

        const site = source("src/lib/seo/site.ts");
        expect(site).toContain(
            'SITE_URL = getProductionAppOrigin("website")',
        );
        expect(site).not.toContain("NEXT_PUBLIC_APP_URL");
    });

    it("keeps runtime API origin separate from SEO canonical origin", () => {
        const layout = source("src/app/(public)/[locale]/layout.tsx");

        expect(layout).toContain(
            "normalizeConfiguredAppOrigin(process.env.NEXT_PUBLIC_APP_URL)",
        );
        expect(layout).toContain("apiOrigin={apiOrigin}");
    });

    it("serves anonymous homepage subjects from the canonical non-DB curriculum owner", () => {
        const onboarding = source(
            "src/lib/onboarding/getOnboardingSubjects.ts",
        );
        const publicMarker =
            "export async function getPublicOnboardingSubjects";
        const publicIndex = onboarding.indexOf(publicMarker);

        expect(publicIndex).toBeGreaterThan(-1);

        const publicSource = onboarding.slice(publicIndex);
        expect(publicSource).toContain("getResolvedCatalogMap()");
        expect(publicSource).toContain("CATALOG_MANIFESTS");
        expect(publicSource).not.toContain("prisma.");
        expect(publicSource).not.toContain("practiceSubject.findMany");
    });

    it("returns the anonymous homepage before DB-backed enrichment", () => {
        const home = source(
            "src/components/home/onboarding/HomePageAvatarOnboardingServer.tsx",
        );

        const guestBranch = home.indexOf("if (!userId)");
        const publicSubjects = home.indexOf(
            "await getPublicOnboardingSubjects()",
            guestBranch,
        );
        const authenticatedSubjects = home.indexOf(
            "getOnboardingSubjects()",
            guestBranch,
        );
        const authenticatedChallenge = home.indexOf(
            "getLatestChallengeCard(locale)",
            guestBranch,
        );
        const authenticatedViewer = home.indexOf(
            "resolvePracticeViewer(prisma",
            guestBranch,
        );

        expect(guestBranch).toBeGreaterThan(-1);
        expect(publicSubjects).toBeGreaterThan(guestBranch);
        expect(authenticatedSubjects).toBeGreaterThan(publicSubjects);
        expect(authenticatedChallenge).toBeGreaterThan(publicSubjects);
        expect(authenticatedViewer).toBeGreaterThan(publicSubjects);
        expect(home).toContain("latestChallenge={null}");
    });

    it("short-circuits anonymous Sandbox access before DB capability checks", () => {
        const sandbox = source(
            "src/app/(public)/[locale]/(learningZone)/sandbox/[category]/[toolSlug]/page.tsx",
        );

        const helperStart = sandbox.indexOf(
            "async function getSandboxAccessForActor",
        );
        const helperEnd = sandbox.indexOf(
            "export default async function SandboxToolPage",
            helperStart,
        );
        const helper = sandbox.slice(helperStart, helperEnd);

        expect(helperStart).toBeGreaterThan(-1);
        expect(helper).toContain("if (!actor.userId)");
        expect(helper.indexOf("if (!actor.userId)")).toBeLessThan(
            helper.indexOf("checkIdeCapability(prisma"),
        );
    });

    it("does not force the localized legal root into an ungenerated static path set", () => {
        const legal = source(
            "src/app/(public)/[locale]/(legal)/legal/page.tsx",
        );

        expect(legal).not.toContain('dynamic = "force-static"');
        expect(legal).not.toContain("dynamicParams = false");
        expect(legal).not.toContain("revalidate = false");
    });
});
