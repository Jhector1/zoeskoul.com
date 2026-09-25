import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../../../..");

function source(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("public challenge social publishing ownership", () => {
  it("keeps browser UI in Admin and provider secrets in Web", () => {
    const admin = source(
      "apps/admin/src/features/public-challenges/PublicChallengeSocialPublisher.tsx",
    );
    const provider = source(
      "apps/web/src/lib/marketing/publicChallengeSocial.ts",
    );

    expect(admin).toContain(
      "/api/admin/public-challenges/social",
    );
    expect(admin).not.toContain(
      "FACEBOOK_PAGE_ACCESS_TOKEN",
    );
    expect(admin).not.toContain(
      "INSTAGRAM_ACCESS_TOKEN",
    );
    expect(admin).not.toContain(
      "LINKEDIN_ACCESS_TOKEN",
    );
    expect(admin).not.toContain(
      "X_USER_ACCESS_TOKEN",
    );

    expect(provider).toContain(
      "FACEBOOK_PAGE_ACCESS_TOKEN",
    );
    expect(provider).toContain(
      "INSTAGRAM_ACCESS_TOKEN",
    );
    expect(provider).toContain(
      "LINKEDIN_ACCESS_TOKEN",
    );
    expect(provider).toContain(
      "X_USER_ACCESS_TOKEN",
    );
  });

  it("shares one manual/daily publisher with durable idempotency", () => {
    const automation = source(
      "apps/web/src/lib/marketing/publicChallengeSocialAutomation.ts",
    );
    const schema = source(
      "packages/db/prisma/schema.prisma",
    );

    expect(automation).toContain(
      "publishChallengeToSocial",
    );
    expect(automation).toContain(
      "publishActiveChallengeToSocial",
    );
    expect(automation).toContain(
      "runDailyPublicChallengeSocialTick",
    );
    expect(schema).toContain(
      "model PublicChallengeSocialPost",
    );
    expect(schema).toContain("idempotencyKey");
    expect(schema).toContain("@unique");
  });

  it("keeps one production tick owner outside Web request lifecycle", () => {
    const compose = source(
      "zoe-infra/hosts/web/docker-compose.yml",
    );
    const tick = source(
      "apps/web/src/app/api/internal/public-challenges/social/tick/route.ts",
    );

    expect(compose).toContain(
      "social-challenge-scheduler:",
    );
    expect(compose).toContain("setInterval");
    expect(tick).toContain(
      "ZOESKOUL_SOCIAL_SCHEDULER_SECRET",
    );
    expect(tick).toContain("timingSafeEqual");
  });
});
