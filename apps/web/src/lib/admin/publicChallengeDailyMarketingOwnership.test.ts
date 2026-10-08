import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = new URL("../../../../../", import.meta.url);

function source(relative: string) {
  return fs.readFileSync(new URL(relative, root), "utf8");
}

describe("daily challenge multi-channel automation ownership", () => {
  it("owns the daily challenge independently of any delivery channel", () => {
    const schema = source("packages/db/prisma/schema.prisma");
    const automation = source(
      "apps/web/src/lib/marketing/publicChallengeSocialAutomation.ts",
    );

    expect(schema).toContain("model PublicChallengeDailyDispatch");
    expect(automation).toContain(
      "prisma.publicChallengeDailyDispatch.findUnique",
    );
    expect(automation).toContain(
      "prisma.publicChallengeDailyDispatch.upsert",
    );
  });

  it("rotates subjects before returning to an unused exercise in the previous subject", () => {
    const automation = source(
      "apps/web/src/lib/marketing/publicChallengeSocialAutomation.ts",
    );

    expect(automation).toContain("chooseNextSubjectRotatedOption");
    expect(automation).toContain("subjectOrder");
    expect(automation).toContain("lastSubjectSlug");
  });

  it("keeps automatic Brevo email optional and separate from social provider types", () => {
    const contracts = source("packages/api-contracts/src/index.ts");
    const automation = source(
      "apps/web/src/lib/marketing/publicChallengeSocialAutomation.ts",
    );
    const emailControls = source(
      "apps/admin/src/features/public-challenges/PublicChallengeAutoEmailControls.tsx",
    );

    expect(contracts).toContain("emailEnabled: boolean");
    expect(contracts).toContain("emailListId: number | null");
    expect(automation).toContain("sendPublicChallengeCampaignNow");
    expect(emailControls).toContain("Automatic email");
    expect(emailControls).toContain("Brevo audience list");
  });
  it("fans the one claimed occurrence challenge through social and Brevo", () => {
    const automation = source(
      "apps/web/src/lib/marketing/publicChallengeSocialAutomation.ts",
    );

    expect(automation).toContain(
      "const occurrence = publicChallengeDailyScheduleOccurrence({",
    );
    expect(automation).toContain(
      "await getDailyPublicChallengeForDispatch(",
    );
    expect(
      automation.match(/dailyOccurrenceId: occurrence\.id/g)?.length,
    ).toBe(2);
    expect(automation).toContain(
      "challenge: currentChallenge",
    );
  });


});
