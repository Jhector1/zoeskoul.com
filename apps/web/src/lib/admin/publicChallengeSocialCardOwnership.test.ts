import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("public challenge automatic social card ownership", () => {
  it("uses canonical authored workspace data and Next ImageResponse", () => {
    const card = source("src/lib/practice/challenges/socialCard.tsx");

    expect(card).toContain('from "next/og"');
    expect(card).toContain("resolveExerciseWorkspace");
    expect(card).toContain("deriveEntryCode");
    expect(card).toContain("resolveDeepTagged");
    expect(card).toContain("getTranslations");
    expect(card).toContain("target.locale");
    expect(card).toContain("Could not resolve starter code");
    expect(card).toContain("highlightCodeLine");
    expect(card).toContain("PYTHON_KEYWORDS");
    expect(card).toContain("SQL_KEYWORDS");
    expect(card).toContain("CODE_COLORS.string");
    expect(card).toContain(
      'from "@zoeskoul/curriculum-runtime/curriculum/resolveManifestExercise"',
    );
    expect(card).toContain("resolveTopicBundleManifest");
    expect(card).toContain("uploadChallengeOgImage");
    expect(card).not.toMatch(
      /playwright|puppeteer|page\.goto|screenshot\(/i,
    );
  });

  it("preserves manual image upload and auto-generates when absent", () => {
    const route = source(
      "src/app/api/practice/trial/share/route.ts",
    );

    expect(route).toContain(
      "uploadGeneratedPublicChallengeSocialCard",
    );
    expect(route).toContain("locale: parsed.data.locale");
    expect(route).toMatch(
      /if \(request\.image\)[\s\S]*else \{/,
    );
  });

  it("shares one ensure boundary across manual and scheduled social posts", () => {
    const automation = source(
      "src/lib/marketing/publicChallengeSocialAutomation.ts",
    );

    expect(automation).toContain(
      "ensurePublicChallengeSocialImage",
    );
    expect(automation).toContain(
      "const challengeWithImage = await ensurePublicChallengeSocialImage",
    );
    expect(automation).toContain(
      "publishActiveChallengeToSocial",
    );
    expect(automation).toContain(
      "runDailyPublicChallengeSocialTick",
    );
  });
});
