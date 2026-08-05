import { loadTutoringSessionPage } from "@/lib/tutoring/loadTutoringSessionPage";
import {
  appCorsJson,
  appCorsPreflight,
  isAppOriginAllowed,
} from "@/lib/http/appCors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  if (!isAppOriginAllowed(request)) {
    return appCorsJson(request, { error: "Forbidden" }, { status: 403 });
  }

  const { sessionId } = await context.params;
  const moduleSlug = new URL(request.url).searchParams.get("moduleSlug");
  const data = await loadTutoringSessionPage({ sessionId, moduleSlug });

  if (data.status === "signed_out") {
    return appCorsJson(
      request,
      { status: "signed_out", message: "Sign in to open this tutoring session." },
      { status: 401 },
    );
  }

  if (data.status === "forbidden") {
    return appCorsJson(
      request,
      { status: "forbidden", message: "This tutoring session is unavailable." },
      { status: 403 },
    );
  }

  if (data.status !== "ready") {
    return appCorsJson(
      request,
      { status: data.status, message: "This tutoring session has no published learning workspace." },
      { status: 404 },
    );
  }

  return appCorsJson(request, {
    status: "ready",
    session: {
      id: sessionId,
      title: data.session.title,
      status: data.session.status,
    },
    snapshot: {
      subjectSlug: data.snapshot.subjectSlug,
    },
    selected: {
      sessionModuleSlug: data.selected.sessionModuleSlug,
      module: data.selected.module,
    },
    canEditOwnProgress: data.canEdit,
    canManage: data.canManage,
    canEditMasterWorkspace: data.canEditMasterWorkspace,
    publishedVersion: data.publishedVersion,
    publishedAt: data.publishedAt,
    participants: data.participants,
  });
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
