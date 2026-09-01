
import { getTeachingUser } from "@/lib/teaching/teachingAccess";
import { listTutoringRequestQueue } from "@/lib/tutoring/tutoringRequestService";
import {
  appCorsJson,
  appCorsPreflight,
  isAppOriginAllowed,
} from "@/lib/http/appCors";


function routeJson(
  request: Request,
  body: unknown,
  status = 200,
) {
  return appCorsJson(request, body, { status });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAppOriginAllowed(request)) {
    return routeJson(request, { error: "Forbidden." }, 403);
  }

  const teachingUser = await getTeachingUser();
  if (!teachingUser) {
    return routeJson(request, { error: "Forbidden" }, 403);
  }

  const queue = await listTutoringRequestQueue({
    teacherId: teachingUser.id,
    isAdmin: teachingUser.isAdmin,
  });

  return routeJson(request, queue);
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
