import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/security/ratelimit";
import {
  applyUserMarketingPreference,
  defaultPublicMarketingPreference,
} from "@/lib/marketing/userMarketingPreference";
import { parseMarketingProviderName } from "@/lib/marketing/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UpdateSchema = z.object({
  marketingEmails: z.boolean(),
  source: z.enum(["profile", "post_auth_prompt"]).optional(),
});

function harden(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set("Content-Security-Policy", "default-src 'none'");
  response.headers.set("Vary", "Cookie");
  return response;
}

function json(data: unknown, status = 200) {
  return harden(NextResponse.json(data, { status }));
}

function isSameOrigin(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") return true;

  const configuredOrigin = process.env.APP_ORIGIN?.trim();
  const allowedOrigins = new Set(
    [configuredOrigin, request.nextUrl.origin].filter(
      (value): value is string => Boolean(value),
    ),
  );

  const origin = request.headers.get("origin");
  if (origin) return allowedOrigins.has(origin);

  const referer = request.headers.get("referer");
  if (!referer) return false;

  try {
    return allowedOrigins.has(new URL(referer).origin);
  } catch {
    return false;
  }
}

async function requireUser() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const email = session?.user?.email?.trim() ?? null;

  if (!session || (!userId && !email)) return null;

  return prisma.user.findUnique({
    where: userId ? { id: userId } : { email: email! },
    select: {
      id: true,
      email: true,
      marketingPreference: {
        select: {
          marketingEmails: true,
          consentAt: true,
          consentSource: true,
          declinedAt: true,
          unsubscribedAt: true,
          provider: true,
          syncStatus: true,
          syncedAt: true,
        },
      },
    },
  });
}

type StoredMarketingPreference = {
  marketingEmails: boolean;
  consentAt: Date | null;
  consentSource: string | null;
  declinedAt: Date | null;
  unsubscribedAt: Date | null;
  provider: string | null;
  syncStatus: string | null;
  syncedAt: Date | null;
};

function serializePreference(preference: StoredMarketingPreference) {
  return {
    marketingEmails: preference.marketingEmails,
    consentAt: preference.consentAt?.toISOString() ?? null,
    consentSource: preference.consentSource,
    declinedAt: preference.declinedAt?.toISOString() ?? null,
    unsubscribedAt: preference.unsubscribedAt?.toISOString() ?? null,
    provider: parseMarketingProviderName(preference.provider),
    syncStatus: preference.syncStatus,
    syncedAt: preference.syncedAt?.toISOString() ?? null,
  };
}

export async function GET() {
  const user = await requireUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  return json({
    hasPreference: Boolean(user.marketingPreference),
    preference: user.marketingPreference
      ? serializePreference(user.marketingPreference)
      : defaultPublicMarketingPreference(),
  });
}

export async function PUT(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ error: "Forbidden" }, 403);

  const user = await requireUser();
  if (!user?.email) return json({ error: "Unauthorized" }, 401);

  try {
    const limit = await rateLimit(`marketing-preferences:${user.id}`, {
      bucket: "marketing-preferences",
      limit: 20,
      window: "60 s",
    });
    if (!limit.ok) {
      const response = json({ error: "Too many requests" }, 429);
      response.headers.set(
        "Retry-After",
        String(Math.max(1, Math.ceil((limit.resetMs - Date.now()) / 1000))),
      );
      return response;
    }
  } catch {
    return json({ error: "Service unavailable" }, 503);
  }

  const parsed = UpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid request" }, 400);

  try {
    const result = await applyUserMarketingPreference({
      userId: user.id,
      email: user.email,
      enabled: parsed.data.marketingEmails,
      source: parsed.data.source ?? "profile",
    });

    return json(result);
  } catch (error) {
    console.error("[marketing-preferences] update failed", {
      userId: user.id,
      detail: error instanceof Error ? error.message : "Unknown error",
    });
    return json({ error: "Could not update email preferences" }, 503);
  }
}
