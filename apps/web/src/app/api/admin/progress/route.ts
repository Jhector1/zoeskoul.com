import { requireAdmin } from "@/lib/admin/requireAdmin";
import { resolveTaggedPresentation } from "@/i18n/resolveTaggedPresentation";
import {
  getProgressDashboard,
  searchParamsToProgressQuery,
} from "@/lib/admin/progress/query";
import {
  appCorsJson,
  appCorsPreflight,
  applyAppCorsHeaders,
  isAppOriginAllowed,
} from "@/lib/http/appCors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function adminDenied(req: Request) {
  const denied = await requireAdmin(req);
  return denied ? applyAppCorsHeaders(req, denied) : null;
}

export async function GET(req: Request) {
  if (!isAppOriginAllowed(req)) {
    return appCorsJson(req, { error: "Forbidden." }, { status: 403 });
  }

  const denied = await adminDenied(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const query = searchParamsToProgressQuery(searchParams);
  const data = await getProgressDashboard(query);
  const presentation = await resolveTaggedPresentation(data);
  const response = appCorsJson(req, presentation);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

export function OPTIONS(req: Request) {
  return appCorsPreflight(req);
}
