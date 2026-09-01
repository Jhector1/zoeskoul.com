import { getCurrentUserAccess } from "@/lib/access/currentUserAccess";
import {
  appCorsJson,
  appCorsPreflight,
  isAppOriginAllowed,
} from "@/lib/http/appCors";
import { listEligibleStudentCampaigns } from "@/lib/campaigns/studentCampaign.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAppOriginAllowed(request)) {
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

  try {
    const campaigns = await listEligibleStudentCampaigns({
      userId: access.user.id,
      subscriber: Boolean(access.capabilities.canUnlockAll),
    });
    return appCorsJson(request, { campaigns });
  } catch (error) {
    console.error("[student-campaigns][active] failed", {
      userId: access.user.id,
      error,
    });
    return appCorsJson(
      request,
      { error: "Student campaigns are temporarily unavailable." },
      { status: 503 },
    );
  }
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
