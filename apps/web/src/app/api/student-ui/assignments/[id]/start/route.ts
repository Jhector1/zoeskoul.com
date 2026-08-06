import { POST as sourcePost } from "@/app/api/assignments/[id]/start/route";
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
