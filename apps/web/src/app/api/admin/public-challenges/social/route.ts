import { z } from "zod";

import {
  PUBLIC_CHALLENGE_SOCIAL_AUTOMATION_PROVIDERS,
  PUBLIC_CHALLENGE_SOCIAL_PROVIDERS,
  type PublicChallengeSocialAutomationSettings,
} from "@zoeskoul/api-contracts";

import {
  appCorsJson,
  appCorsPreflight,
  isAppOriginAllowed,
} from "@/lib/http/appCors";
import {
  getPublicChallengeSocialAdminState,
  publishActiveChallengeToSocial,
  updatePublicChallengeSocialAutomationSettings,
} from "@/lib/marketing/publicChallengeSocialAutomation";
import {
  resolveChallengePublisherAccess,
} from "@/lib/practice/challenges/publisherAccess";
import { readJsonSafe } from "@/lib/practice/api/shared/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ProviderSchema = z.enum(
  PUBLIC_CHALLENGE_SOCIAL_PROVIDERS,
);

const PublishSchema = z
  .object({
    challengeCode: z.string().trim().min(8).max(24),
    providers: z
      .array(ProviderSchema)
      .min(1)
      .max(PUBLIC_CHALLENGE_SOCIAL_PROVIDERS.length),
    tiktok: z
      .object({
        title: z.string().trim().min(1).max(90),
        description: z.string().trim().min(1).max(4000),
        consent: z.literal(true),
      })
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.providers.includes("tiktok") && !value.tiktok) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tiktok"],
        message: "TikTok requires editable copy and explicit consent.",
      });
    }
  });

const AutomationProviderSchema = z.enum(
  PUBLIC_CHALLENGE_SOCIAL_AUTOMATION_PROVIDERS,
);

const AutomationSchema = z.object({
  enabled: z.boolean(),
  locale: z.enum(["en", "fr", "ht"]),
  localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().trim().min(1).max(80),
  providers: z
    .array(AutomationProviderSchema)
    .max(PUBLIC_CHALLENGE_SOCIAL_AUTOMATION_PROVIDERS.length),
  emailEnabled: z.boolean().default(false),
  emailListId: z.number().int().positive().nullable().default(null),
});

async function authorize(request: Request) {
  if (!isAppOriginAllowed(request)) {
    return appCorsJson(
      request,
      { error: "Forbidden." },
      { status: 403 },
    );
  }

  const access = await resolveChallengePublisherAccess();
  if (!access.authenticated) {
    return appCorsJson(
      request,
      { error: "Unauthorized." },
      { status: 401 },
    );
  }
  if (!access.allowed) {
    return appCorsJson(
      request,
      { error: "Publisher access required." },
      { status: 403 },
    );
  }
  return null;
}

export async function GET(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;
  return appCorsJson(
    request,
    await getPublicChallengeSocialAdminState(),
  );
}

export async function PUT(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;

  const parsed = AutomationSchema.safeParse(
    await readJsonSafe(request),
  );
  if (!parsed.success) {
    return appCorsJson(
      request,
      { error: "Invalid social automation settings." },
      { status: 400 },
    );
  }

  try {
    const automation =
      await updatePublicChallengeSocialAutomationSettings(
        parsed.data as PublicChallengeSocialAutomationSettings,
      );
    return appCorsJson(request, { ok: true, automation });
  } catch (error) {
    return appCorsJson(
      request,
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not save social automation settings.",
      },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;

  const parsed = PublishSchema.safeParse(
    await readJsonSafe(request),
  );
  if (!parsed.success) {
    return appCorsJson(
      request,
      { error: "Invalid social publishing request." },
      { status: 400 },
    );
  }

  try {
    return appCorsJson(
      request,
      await publishActiveChallengeToSocial(parsed.data),
    );
  } catch (error) {
    console.error("[public-challenge-social] publish failed", error);
    return appCorsJson(
      request,
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not publish the challenge.",
      },
      { status: 400 },
    );
  }
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
