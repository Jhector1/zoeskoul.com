import { z } from "zod";

import {
  appCorsJson,
  appCorsPreflight,
  isAppOriginAllowed,
} from "@/lib/http/appCors";
import {
  BrevoApiError,
  BrevoConfigurationError,
} from "@/lib/marketing/brevoApi";
import {
  renderPublicChallengeCampaign,
  sendPublicChallengeCampaignNow,
  sendPublicChallengeCampaignTest,
} from "@/lib/marketing/publicChallengeCampaign";
import { resolveChallengePublisherAccess } from "@/lib/practice/challenges/publisherAccess";
import { readJsonSafe } from "@/lib/practice/api/shared/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EmailActionSchema = z.object({
  action: z.enum(["preview", "test", "send"]),
  sourceListId: z.number().int().positive().optional(),
  excludedEmails: z.array(z.string().email()).max(5_000).default([]),
  testEmail: z.string().email().optional(),
  challengeUrl: z.string().url().max(2_048),
  imageUrl: z.string().url().max(2_048).nullable().optional(),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(600).default(""),
});

export async function POST(request: Request) {
  if (!isAppOriginAllowed(request)) {
    return appCorsJson(request, { error: "Forbidden." }, { status: 403 });
  }

  const access = await resolveChallengePublisherAccess();
  if (!access.authenticated) {
    return appCorsJson(request, { error: "Unauthorized." }, { status: 401 });
  }
  if (!access.allowed) {
    return appCorsJson(
      request,
      { error: "Publisher access required." },
      { status: 403 },
    );
  }

  const parsed = EmailActionSchema.safeParse(await readJsonSafe(request));
  if (!parsed.success) {
    return appCorsJson(
      request,
      { error: "Invalid email announcement request." },
      { status: 400 },
    );
  }

  const input = parsed.data;

  try {
    if (input.action === "preview") {
      return appCorsJson(
        request,
        renderPublicChallengeCampaign(input),
      );
    }

    if (!input.sourceListId) {
      return appCorsJson(
        request,
        { error: "Choose a Brevo audience list." },
        { status: 400 },
      );
    }

    if (input.action === "test") {
      if (!input.testEmail) {
        return appCorsJson(
          request,
          { error: "Choose a Brevo-list contact for the test email." },
          { status: 400 },
        );
      }

      return appCorsJson(
        request,
        await sendPublicChallengeCampaignTest({
          ...input,
          sourceListId: input.sourceListId,
          testEmail: input.testEmail,
        }),
      );
    }

    return appCorsJson(
      request,
      await sendPublicChallengeCampaignNow({
        ...input,
        sourceListId: input.sourceListId,
        excludedEmails: input.excludedEmails,
      }),
    );
  } catch (error) {
    const notConfigured = error instanceof BrevoConfigurationError;
    const brevoApiError = error instanceof BrevoApiError;

    console.error("[public-challenge-email] campaign action failed", {
      action: input.action,
      error,
    });

    const message = notConfigured
      ? error.message
      : brevoApiError
        ? `Brevo rejected the request: ${error.message}`
        : "Brevo could not complete the campaign action.";

    return appCorsJson(
      request,
      { error: message },
      { status: notConfigured ? 503 : 502 },
    );
  }
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
