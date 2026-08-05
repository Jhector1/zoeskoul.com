import { GET as sourceGet } from "@/app/api/certificates/subject/pdf/route";
import { proxyStudentUiRoute, studentUiPreflight } from "@/lib/http/studentUiRouteProxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return proxyStudentUiRoute(request, sourceGet);
}

export function OPTIONS(request: Request) {
  return studentUiPreflight(request);
}
