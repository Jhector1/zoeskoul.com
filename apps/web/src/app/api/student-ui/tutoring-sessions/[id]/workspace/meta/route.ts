import { GET as sourceGet } from "@/app/api/tutoring-sessions/[id]/workspace/meta/route";
import { proxyStudentUiRoute, studentUiPreflight } from "@/lib/http/studentUiRouteProxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return proxyStudentUiRoute(request, (trusted) => sourceGet(trusted, context));
}

export function OPTIONS(request: Request) {
  return studentUiPreflight(request);
}
