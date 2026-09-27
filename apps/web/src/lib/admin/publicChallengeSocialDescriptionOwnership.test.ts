import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("public challenge social description ownership", () => {
  it("carries the authored prompt through the canonical challenge option contract", () => {
    const contracts = source("../../packages/api-contracts/src/index.ts");
    const catalog = source("src/lib/practice/challenges/publishedCatalog.ts");

    expect(contracts).toContain("exercisePrompt?: string | null;");
    expect(catalog).toContain("exercisePrompt?: string | null;");
    expect(catalog).toContain("exercisePromptReference");
    expect(catalog).toContain("exercise.prompt");
    expect(catalog).toContain("exercise.promptKey");
    expect(catalog).toContain("exercise.messageBase");
    expect(catalog).toContain("`@:${messageBase}.prompt`");
  });

  it("uses the exercise prompt as editable social copy with a 240-character cap", () => {
    const admin = source(
      "../admin/src/features/public-challenges/PublicChallengePublisher.tsx",
    );

    expect(admin).toContain("defaultPublicChallengeShareDescription");
    expect(admin).toContain("compactPublicChallengeShareDescription");
    expect(admin).toContain("MAX_PUBLIC_CHALLENGE_SHARE_DESCRIPTION = 240");
    expect(admin).toContain("option?.exercisePrompt");
    expect(admin).toContain(
      "defaultPublicChallengeShareDescription(selected)",
    );
    expect(admin).toContain("selected?.exercisePrompt");
  });

  it("keeps the canonical persisted description for Facebook link posts", () => {
    const share = source("src/app/api/practice/trial/share/route.ts");
    const social = source("src/lib/marketing/publicChallengeSocial.ts");

    expect(share).toContain("shareDescription");
    expect(social).toContain("content.description");
    expect(social).toContain("message: caption(content)");
    expect(social).toContain("link: content.challengeUrl");
  });
});
