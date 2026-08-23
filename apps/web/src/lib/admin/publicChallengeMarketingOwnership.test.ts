import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(process.cwd(), "../..");

function source(relative: string) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

describe("Public Challenge marketing ownership", () => {
  it("keeps Brevo secrets and campaign calls on Web", () => {
    const publisher = source(
      "apps/admin/src/features/public-challenges/PublicChallengePublisher.tsx",
    );
    const server = source(
      "apps/web/src/lib/marketing/publicChallengeCampaign.ts",
    );
    const brevoApi = source(
      "apps/web/src/lib/marketing/brevoApi.ts",
    );

    expect(publisher).not.toContain("BREVO_API_KEY");
    expect(publisher).not.toContain("api.brevo.com");
    expect(publisher).not.toContain("emailCampaigns");
    expect(publisher).not.toContain("UserMarketingPreference");
    expect(brevoApi).toContain("BREVO_API_KEY");
    expect(server).toContain("/emailCampaigns");
  });

  it("keeps Brevo contacts authoritative", () => {
    const server = source(
      "apps/web/src/lib/marketing/publicChallengeCampaign.ts",
    );

    expect(server).toContain("/contacts/lists/${listId}/contacts");
    expect(server).toContain("emailBlacklisted");
    expect(server).toContain("listUnsubscribed");
    expect(server).not.toContain("UserMarketingPreference");
    expect(server).not.toContain("@/lib/prisma");
  });

  it("uses campaign recipients, exclusions, test, sendNow, and unsubscribe", () => {
    const server = source(
      "apps/web/src/lib/marketing/publicChallengeCampaign.ts",
    );

    expect(server).toContain("listIds");
    expect(server).toContain("exclusionListIds");
    expect(server).toContain("/sendTest");
    expect(server).toContain("/sendNow");
    expect(server).toContain("{{ unsubscribe }}");
  });

  it("keeps publisher access and app CORS on both new APIs", () => {
    for (const relative of [
      "apps/web/src/app/api/admin/public-challenges/audience/route.ts",
      "apps/web/src/app/api/admin/public-challenges/email/route.ts",
    ]) {
      const route = source(relative);
      expect(route).toContain("resolveChallengePublisherAccess");
      expect(route).toContain("isAppOriginAllowed");
      expect(route).toContain("appCorsJson");
      expect(route).toContain("appCorsPreflight");
      expect(route).not.toContain("requireAdmin");
    }
  });

  it("adds Brevo email without removing the original publisher controls", () => {
    const publisher = source(
      "apps/admin/src/features/public-challenges/PublicChallengePublisher.tsx",
    );
    expect(publisher).toContain("ZOESKOUL_PUBLIC_CHALLENGE_BREVO_ADD_ONLY_V77C5");
    expect(publisher).toContain("Email announcement");
    expect(publisher).toContain("Facebook and social preview");
    expect(publisher).toContain("Create and copy challenge link");
  });
  it("requires test recipients to come from the current Brevo list", () => {
    const publisher = source(
      "apps/admin/src/features/public-challenges/PublicChallengePublisher.tsx",
    );
    const server = source(
      "apps/web/src/lib/marketing/publicChallengeCampaign.ts",
    );

    expect(publisher).toContain("ZOESKOUL_BREVO_LIST_TEST_RECIPIENT_V77C10");
    expect(publisher).toContain("Test recipient");
    expect(publisher).toContain("testRecipientEmail");
    expect(server).toContain("not in the selected Brevo list");
    expect(server).toContain("testContact.selectable");
  });

  it("uploads an authored preview image before Brevo preview/test without creating a challenge link", () => {
    const publisher = source(
      "apps/admin/src/features/public-challenges/PublicChallengePublisher.tsx",
    );
    const uploadRoute = source(
      "apps/web/src/app/api/admin/public-challenges/email-image/route.ts",
    );

    expect(publisher).toContain("ZOESKOUL_PUBLIC_CHALLENGE_EMAIL_IMAGE_UPLOAD_V77C12B");
    expect(publisher).toContain(
      "/api/admin/public-challenges/email-image",
    );
    expect(publisher).toContain("ensureEmailImageUrl");
    expect(uploadRoute).toContain("uploadChallengeOgImage");
    expect(uploadRoute).toContain("cloudinaryServerImageUrl");
    expect(uploadRoute).not.toContain("prisma");
    expect(uploadRoute).not.toContain("createPracticeChallengeCode");
  });

});
