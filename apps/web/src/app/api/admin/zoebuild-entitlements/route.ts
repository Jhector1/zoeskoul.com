import { FeatureKey } from "@zoeskoul/db";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import {
  appCorsJson,
  appCorsPreflight,
  applyAppCorsHeaders,
  isAppOriginAllowed,
} from "@/lib/http/appCors";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUILD_AI_FEATURES = [
  FeatureKey.build_ai_generate,
  FeatureKey.build_ai_edit,
] as const;

function response(req: Request, body: Record<string, unknown>, status = 200) {
  const result = appCorsJson(req, body, { status });
  result.headers.set("Cache-Control", "private, no-store");
  return result;
}

/**
 * An administrative, read-only view of actual grant records.
 * The client cannot create privileges, infer a billing plan, or read grant meta.
 */
export async function GET(req: Request) {
  if (!isAppOriginAllowed(req)) {
    return response(req, { error: "Forbidden." }, 403);
  }

  const denied = await requireAdmin(req);
  if (denied) {
    const answer = applyAppCorsHeaders(req, denied);
    answer.headers.set("Cache-Control", "private, no-store");
    return answer;
  }

  const userId = new URL(req.url).searchParams.get("userId")?.trim() ?? "";
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(userId)) {
    return response(req, { error: "A valid userId is required." }, 400);
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) return response(req, { error: "User not found." }, 404);

    const grants = await prisma.featureGrant.findMany({
      where: { userId: user.id, feature: { in: [...BUILD_AI_FEATURES] } },
      select: {
        id: true,
        feature: true,
        type: true,
        startsAt: true,
        endsAt: true,
        revokedAt: true,
      },
      orderBy: { startsAt: "desc" },
    });
    const now = new Date();
    const entries = grants.map((grant) => ({
      ...grant,
      active:
        grant.revokedAt === null &&
        (grant.startsAt === null || grant.startsAt <= now) &&
        (grant.endsAt === null || grant.endsAt > now),
    }));

    return response(req, { userId: user.id, checkedAt: now.toISOString(), grants: entries });
  } catch {
    // Never leak database details or serialized grant metadata in an HTTP response.
    return response(req, { error: "Entitlement audit unavailable." }, 503);
  }
}

export function OPTIONS(req: Request) {
  return appCorsPreflight(req);
}
