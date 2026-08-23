import {
  appCorsJson,
  appCorsPreflight,
  applyAppCorsHeaders,
  isAppOriginAllowed,
} from "@/lib/http/appCors";
import { requireAdmin } from "@/lib/admin/requireAdmin";

export async function runAdminCurriculumDraftRoute(
  request: Request,
  handler: () => Promise<Response>,
) {
  if (!isAppOriginAllowed(request)) {
    return appCorsJson(
      request,
      { error: "Forbidden." },
      { status: 403 },
    );
  }

  const denied = await requireAdmin(request);
  if (denied) {
    return applyAppCorsHeaders(request, denied);
  }

  return applyAppCorsHeaders(request, await handler());
}

export function adminCurriculumDraftOptions(request: Request) {
  return appCorsPreflight(request);
}
