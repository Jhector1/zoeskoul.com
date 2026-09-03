import {
  appCorsJson,
  appCorsPreflight,
  isAppOriginAllowed,
} from "@/lib/http/appCors";
import {
  getLearningOrganizationReport,
} from "@/lib/learningOrganizations/schoolReport";
import {
  getLearningOrganizationAccess,
} from "@/lib/teaching/schoolAccess";
import {
  getTeachingUser,
} from "@/lib/teaching/teachingAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  request: Request,
  context: RouteContext,
) {
  if (!isAppOriginAllowed(request)) {
    return appCorsJson(
      request,
      { error: "Forbidden." },
      { status: 403 },
    );
  }

  const teachingUser =
    await getTeachingUser();

  if (!teachingUser) {
    return appCorsJson(
      request,
      { error: "Forbidden." },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  const resolved =
    await getLearningOrganizationAccess({
      organizationId: id,
      teachingUser,
    });

  if (!resolved) {
    return appCorsJson(
      request,
      { error: "School not found." },
      { status: 404 },
    );
  }

  if (!resolved.access.canManageSchool) {
    return appCorsJson(
      request,
      { error: "Forbidden." },
      { status: 403 },
    );
  }

  const report =
    await getLearningOrganizationReport(id);

  if (!report) {
    return appCorsJson(
      request,
      { error: "School not found." },
      { status: 404 },
    );
  }

  return appCorsJson(request, {
    report,
  });
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
