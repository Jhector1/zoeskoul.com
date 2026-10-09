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
    for (const secretName of [
      "X_API_KEY",
      "X_API_SECRET",
      "X_ACCESS_TOKEN",
      "X_ACCESS_TOKEN_SECRET",
      "THREADS_ACCESS_TOKEN",
      "REDDIT_ACCESS_TOKEN",
      "REDDIT_CLIENT_SECRET",
      "REDDIT_REFRESH_TOKEN",
      "TIKTOK_ACCESS_TOKEN",
    ]) {
      expect(admin).not.toContain(secretName);
    }

    expect(provider).toContain(
      "FACEBOOK_PAGE_ACCESS_TOKEN",
    );
    expect(provider).toContain(
      "INSTAGRAM_ACCESS_TOKEN",
    );
    expect(provider).toContain(
      "LINKEDIN_ACCESS_TOKEN",
    );
    for (const secretName of [
      "X_API_KEY",
      "X_API_SECRET",
      "X_ACCESS_TOKEN",
      "X_ACCESS_TOKEN_SECRET",
      "THREADS_ACCESS_TOKEN",
      "REDDIT_ACCESS_TOKEN",
      "REDDIT_CLIENT_SECRET",
      "REDDIT_REFRESH_TOKEN",
      "TIKTOK_ACCESS_TOKEN",
    ]) {
      expect(provider).toContain(secretName);
    }
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
  it("renders the real publication timestamp for recent social posts", () => {
    const admin = source(
      "apps/admin/src/features/public-challenges/PublicChallengeSocialPublisher.tsx",
    );

    expect(admin).toContain(
      "post.publishedAt ?? post.createdAt",
    );
    expect(admin).toContain(
      "formatRecentPostTimestamp(post, settings?.timezone)",
    );
    expect(admin).not.toContain("{post.dispatchDate}");
  });

  it("derives route and automation providers from the shared catalog", () => {
    const contracts = source("packages/api-contracts/src/index.ts");
    const route = source("apps/web/src/app/api/admin/public-challenges/social/route.ts");
    const automation = source("apps/web/src/lib/marketing/publicChallengeSocialAutomation.ts");

    expect(contracts).toContain("PUBLIC_CHALLENGE_SOCIAL_PROVIDERS");
    expect(route).toContain("PUBLIC_CHALLENGE_SOCIAL_PROVIDERS");
    expect(automation).toContain("...PUBLIC_CHALLENGE_SOCIAL_AUTOMATION_PROVIDERS");
  });

  it("keeps TikTok compliance media separate from the branded social card", () => {
    const card = source("apps/web/src/lib/practice/challenges/socialCard.tsx");
    const automation = source("apps/web/src/lib/marketing/publicChallengeSocialAutomation.ts");

    expect(card).toContain("uploadGeneratedPublicChallengeTikTokCard");
    expect(card).toContain("branding: false");
    expect(automation).toContain("ensurePublicChallengeTikTokImage");
    expect(automation).toContain('provider === "tiktok"');
  });

  it("keeps TikTok manual-only with editable copy and explicit consent", () => {
    const contracts = source("packages/api-contracts/src/index.ts");
    const route = source(
      "apps/web/src/app/api/admin/public-challenges/social/route.ts",
    );
    const admin = source(
      "apps/admin/src/features/public-challenges/PublicChallengeSocialPublisher.tsx",
    );

    expect(contracts).toContain(
      "PUBLIC_CHALLENGE_SOCIAL_MANUAL_ONLY_PROVIDERS",
    );
    expect(contracts).toContain(
      "PUBLIC_CHALLENGE_SOCIAL_AUTOMATION_PROVIDERS",
    );
    expect(route).toContain(
      'message: "TikTok requires editable copy and explicit consent."',
    );
    expect(admin).toContain("TikTok manual post");
    expect(admin).toContain("tiktokConsent");
    expect(admin).toContain("Post to TikTok");
  });


});
