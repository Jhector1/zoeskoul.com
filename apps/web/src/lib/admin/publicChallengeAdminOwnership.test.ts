import {
  existsSync,
  readFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "../..");

describe("Public Challenges Admin ownership", () => {
  it("keeps the browser publisher in Vite Admin", () => {
    expect(
      existsSync(
        resolve(
          root,
          "apps/admin/src/features/public-challenges/PublicChallengePublisher.tsx",
        ),
      ),
    ).toBe(true);

    expect(
      existsSync(
        resolve(
          root,
          "apps/web/src/components/admin/public-challenges/PublicChallengePublisher.tsx",
        ),
      ),
    ).toBe(false);
  });

  it("keeps the old Web page redirect-only", () => {
    const source = readFileSync(
      resolve(
        root,
        "apps/web/src/app/(public)/[locale]/(platform)/admin/public-challenges/page.tsx",
      ),
      "utf8",
    );

    expect(source).toContain("redirect(");
    expect(source).not.toContain("PublicChallengePublisher");
    expect(source).not.toContain(
      "listPublishedChallengeExerciseOptions",
    );
  });

  it("keeps publisher access server authoritative", () => {
    const source = readFileSync(
      resolve(
        root,
        "apps/web/src/lib/practice/challenges/publisherAccess.ts",
      ),
      "utf8",
    );

    expect(source).toContain('"admin"');
    expect(source).toContain('"publisher"');
    expect(source).toContain('"author"');
    expect(source).toContain("resolveChallengePublisherAccess");
  });

  it("uses the shared browser API transport", () => {
    const source = readFileSync(
      resolve(
        root,
        "apps/admin/src/features/public-challenges/PublicChallengePublisher.tsx",
      ),
      "utf8",
    );

    expect(source).toContain('from "@/lib/adminApi"');
    expect(source).toContain("adminFetch(");
    expect(source).not.toContain(
      '@/lib/practice/challenges/publishedCatalog',
    );
    expect(source).not.toContain(
      '@/lib/practice/challenges/eligibility',
    );
    expect(source).not.toContain(
      '@/lib/practice/challenges/capture',
    );
    expect(source).toContain(
      'from "@zoeskoul/practice-contracts"',
    );
    expect(
      (source.match(/style=\{\{/g) ?? []).length,
    ).toBeLessThanOrEqual(1);
  });

  it("keeps browser-safe challenge helpers canonical in the existing shared package", () => {
    const shared = readFileSync(
      resolve(
        root,
        "packages/practice-contracts/src/publicChallenges.ts",
      ),
      "utf8",
    );
    const eligibilityAdapter = readFileSync(
      resolve(
        root,
        "apps/web/src/lib/practice/challenges/eligibility.ts",
      ),
      "utf8",
    );
    const captureAdapter = readFileSync(
      resolve(
        root,
        "apps/web/src/lib/practice/challenges/capture.ts",
      ),
      "utf8",
    );

    expect(shared).toContain("isEligiblePublicChallengeTarget");
    expect(shared).toContain("assertEligiblePublicChallengeTarget");
    expect(shared).toContain("computeChallengeShareCoverCrop");
    expect(shared).toContain("challengeScreenshotFilename");
    expect(shared).not.toContain("server-only");
    expect(shared).not.toContain("next/");
    expect(shared).not.toContain("@/");

    expect(eligibilityAdapter).toContain(
      'from "@zoeskoul/practice-contracts"',
    );
    expect(captureAdapter).toContain(
      'from "@zoeskoul/practice-contracts"',
    );
  });

  it("keeps challenge share and preview runtime in Web with app CORS", () => {
    for (const relative of [
      "apps/web/src/app/api/practice/trial/share/route.ts",
      "apps/web/src/app/api/practice/trial/preview/route.ts",
    ]) {
      const source = readFileSync(
        resolve(root, relative),
        "utf8",
      );

      expect(source).toContain("isAppOriginAllowed");
      expect(source).toContain("appCorsPreflight");
      expect(source).toContain("applyAppCorsHeaders");
      expect(source).toContain(
        "requireChallengePublisherAccessApi",
      );
    }
  });
});
