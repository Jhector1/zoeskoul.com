import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(process.cwd(), "../..");

function source(relative: string) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

describe("home latest daily challenge ownership", () => {
  it("prefers the automatic daily dispatch over an unrelated newer manual link", () => {
    const home = source(
      "apps/web/src/components/home/onboarding/HomePageAvatarOnboardingServer.tsx",
    );
    const shortLink = source(
      "apps/web/src/lib/practice/challenges/shortLink.ts",
    );

    expect(shortLink).toContain(
      "getLatestDailyPracticeChallengeLink",
    );
    expect(shortLink).toContain(
      "prisma.publicChallengeDailyDispatch.findFirst",
    );
    expect(shortLink).toContain(
      '{ dispatchDate: "desc" }',
    );

    expect(home).toContain(
      "await getLatestDailyPracticeChallengeLink(challengeLocale)",
    );
    expect(home).toContain(
      "await getLatestActivePracticeChallengeLink(challengeLocale)",
    );
    expect(home).toContain("source: link");
  });

  it("keeps the manual/latest-link fallback when no daily dispatch exists", () => {
    const home = source(
      "apps/web/src/components/home/onboarding/HomePageAvatarOnboardingServer.tsx",
    );

    const daily = home.indexOf(
      "getLatestDailyPracticeChallengeLink(challengeLocale)",
    );
    const fallback = home.indexOf(
      "getLatestActivePracticeChallengeLink(challengeLocale)",
    );

    expect(daily).toBeGreaterThanOrEqual(0);
    expect(fallback).toBeGreaterThan(daily);
  });
});
