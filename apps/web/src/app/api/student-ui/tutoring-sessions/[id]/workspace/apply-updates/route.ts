import { POST as sourcePost } from "@/app/api/tutoring-sessions/[id]/workspace/apply-updates/route";
import { proxyStudentUiRoute, studentUiPreflight } from "@/lib/http/studentUiRouteProxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return proxyStudentUiRoute(request, (trusted) => sourcePost(trusted, context));
}

export function OPTIONS(request: Request) {
  return studentUiPreflight(request);
}
