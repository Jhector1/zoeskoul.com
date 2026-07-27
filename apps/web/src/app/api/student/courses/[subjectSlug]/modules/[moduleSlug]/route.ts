import { getCurrentUserAccess } from "@/lib/access/currentUserAccess";
import {
  appCorsJson,
  appCorsPreflight,
  isAppOriginAllowed,
} from "@/lib/http/appCors";
import {
  loadStudentModuleOverview,
} from "@/lib/learning/studentCourseReaderData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: {
    params: Promise<{
      subjectSlug: string;
      moduleSlug: string;
    }>;
  },
) {
  if (!isAppOriginAllowed(request)) {
    return appCorsJson(
      request,
      { error: "Forbidden" },
      { status: 403 },
    );
  }

  const access = await getCurrentUserAccess();

  if (!access.authenticated || !access.user) {
    return appCorsJson(
      request,
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  if (!access.capabilities.accessStudentApp) {
    return appCorsJson(
      request,
      { error: "Forbidden" },
      { status: 403 },
    );
  }

  const {
    subjectSlug,
    moduleSlug,
  } = await context.params;

  const result = await loadStudentModuleOverview({
    actor: {
      userId: access.user.id,
      canUnlockAll:
        access.capabilities.canUnlockAll,
    },
    subjectSlug,
    moduleSlug,
  });

  if (result.status === "missing") {
    return appCorsJson(
      request,
      { error: "Module not found" },
      { status: 404 },
    );
  }

  return appCorsJson(request, result.data);
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
