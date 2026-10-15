import { after } from "next/server";

import { createPlatformAuth } from "@zoeskoul/platform-auth";

import { ensureStudentCampaignTutoringGrants } from "@/lib/campaigns/studentCampaign.server";
import { sendWelcomeEmail } from "@/lib/email/welcomeEmail";
import { resolveAuthRedirect } from "@/lib/auth/resolveAuthRedirect";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = createPlatformAuth({
  prisma,
  signInPath: "/authenticate",

  resolveRedirect({ url, baseUrl }) {
    return resolveAuthRedirect({
      url,
      baseUrl,
      includeLocalApps: process.env.NODE_ENV !== "production",
    });
  },

  onCreateUser(user) {
    const userId = user.id;
    if (!userId) return;

    after(async () => {
      try {
        const grants = await ensureStudentCampaignTutoringGrants(userId);
        if (grants > 0) {
          console.info("[auth][student-campaign-grant] applied", {
            userId,
            grants,
          });
        }
      } catch (error) {
        console.error("[auth][student-campaign-grant] failed", {
          userId,
          error,
        });
      }
    });

    if (!user.email) return;

    const email = user.email;
    const name = user.name;

    after(async () => {
      const result = await sendWelcomeEmail({ to: email, name });

      if (result.delivered) {
        console.info("[auth][welcome-email] accepted", {
          userId,
          provider: result.provider,
          messageId: result.messageId,
        });
        return;
      }

      const details = {
        userId,
        provider: result.provider,
        reason: result.reason,
        detail: "detail" in result ? result.detail : undefined,
      };

      if (result.reason === "not_configured") {
        console.warn("[auth][welcome-email] skipped", details);
      } else {
        console.error("[auth][welcome-email] failed", details);
      }
    });
  },
});
