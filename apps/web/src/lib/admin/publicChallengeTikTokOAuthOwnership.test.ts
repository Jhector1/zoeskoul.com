import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("TikTok single-account publisher ownership", () => {
  it("reuses the canonical Account OAuth token store instead of adding another token model", () => {
    const connection = source(
      "apps/web/src/lib/marketing/publicChallengeTikTokConnection.ts",
    );
    const schema = source("packages/db/prisma/schema.prisma");

    expect(connection).toContain("prisma.account");
    expect(connection).toContain('"zoeskoul-tiktok-publisher"');
    expect(schema).not.toContain("model PublicChallengeTikTokConnection");
  });

  it("keeps secrets server-side and protects the one-time callback with state", () => {
    const admin = source(
      "apps/admin/src/features/public-challenges/PublicChallengeSocialPublisher.tsx",
    );
    const connection = source(
      "apps/web/src/lib/marketing/publicChallengeTikTokConnection.ts",
    );
    const connect = source(
      "apps/web/src/app/api/integrations/tiktok/connect/route.ts",
    );
    const callback = source(
      "apps/web/src/app/api/integrations/tiktok/callback/route.ts",
    );

    expect(admin).not.toContain("TIKTOK_CLIENT_SECRET");
    expect(admin).not.toContain("TIKTOK_ACCESS_TOKEN");
    expect(admin).not.toContain("TIKTOK_REFRESH_TOKEN");
    expect(connection).toContain("TIKTOK_CLIENT_SECRET");
    expect(connect).toContain("TIKTOK_OAUTH_STATE_COOKIE");
    expect(callback).toContain("expectedState !== returnedState");
  });

  it("keeps TikTok manual-only and serves pull media from the verified ZoeSkoul domain", () => {
    const contracts = source("packages/api-contracts/src/index.ts");
    const automation = source(
      "apps/web/src/lib/marketing/publicChallengeSocialAutomation.ts",
    );
    const media = source(
      "apps/web/src/app/api/public-challenges/tiktok-media/[code]/route.ts",
    );

    expect(contracts).toContain(
      "PUBLIC_CHALLENGE_SOCIAL_MANUAL_ONLY_PROVIDERS",
    );
    expect(automation).toContain(
      "/api/public-challenges/tiktok-media/",
    );
    expect(media).toContain("tiktokImagePublicId");
    expect(media).toContain("cloudinaryServerImageUrl");
  });
});
