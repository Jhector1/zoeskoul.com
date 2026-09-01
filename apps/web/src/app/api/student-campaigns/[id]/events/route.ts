import { getCurrentUserAccess } from "@/lib/access/currentUserAccess";
import {
  appCorsJson,
  appCorsPreflight,
  isAppMutationOriginAllowed,
} from "@/lib/http/appCors";
import { recordStudentCampaignEvent } from "@/lib/campaigns/studentCampaign.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  if (!isAppMutationOriginAllowed(request)) {
    return appCorsJson(
      request,
      { error: "Forbidden." },
      { status: 403 },
    );
  }

  const access = await getCurrentUserAccess();
  if (!access.authenticated || !access.user) {
    return appCorsJson(
      request,
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const event =
    body && typeof body === "object" && "event" in body
      ? body.event
      : null;

  if (
    event !== "impression" &&
    event !== "dismiss" &&
    event !== "dont_show_again"
  ) {
    return appCorsJson(
      request,
      { error: "Invalid campaign event." },
      { status: 400 },
    );
  }

  const { id } = await ctx.params;

  try {
    await recordStudentCampaignEvent({
      campaignId: id,
      userId: access.user.id,
      event,
    });
    return appCorsJson(request, { ok: true });
  } catch (error) {
    console.error("[student-campaigns][event] failed", {
      campaignId: id,
      userId: access.user.id,
      event,
      error,
    });
    return appCorsJson(
      request,
      { error: "Campaign event could not be recorded." },
      { status: 409 },
    );
  }
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
