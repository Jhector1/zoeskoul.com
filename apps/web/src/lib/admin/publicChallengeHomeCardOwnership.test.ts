import fs from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../../../../", import.meta.url);

function source(relative: string) {
  return fs.readFileSync(new URL(relative, root), "utf8");
}

describe("home latest daily challenge ownership", () => {
  it("uses the scheduler-claimed daily dispatch as the only homepage challenge source", () => {
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
      '{ createdAt: "desc" }',
    );

    expect(home).toContain(
      "await getLatestDailyPracticeChallengeLink(challengeLocale)",
    );
    expect(home).not.toContain(
      "getLatestActivePracticeChallengeLink",
    );
    expect(home).toContain("source: link");
  });

  it("does not promote a manually-created active link when no daily occurrence was claimed", () => {
    const home = source(
      "apps/web/src/components/home/onboarding/HomePageAvatarOnboardingServer.tsx",
    );

    expect(home).toContain(
      "const link = await getLatestDailyPracticeChallengeLink(challengeLocale);",
    );
    expect(home).not.toContain(
      "getLatestActivePracticeChallengeLink",
    );
  });
});
