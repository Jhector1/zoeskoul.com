
import { rateLimit } from "@/lib/security/ratelimit";
import { getTeachingUser } from "@/lib/teaching/teachingAccess";
import {
  TutoringSessionContextRequiredError,
  TutoringSessionMaterializationConflictError,
  TutoringSessionMaterializationNotFoundError,
  materializeTutoringSessionForRequest,
} from "@/lib/tutoring/tutoringCommercialSession";
import {
  appCorsJson,
  appCorsPreflight,
  isAppMutationOriginAllowed,
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAppMutationOriginAllowed(request)) {
    return routeJson(request, { error: "Forbidden." }, 403);
  }

  const teachingUser = await getTeachingUser();
  if (!teachingUser) {
    return routeJson(request, { error: "Forbidden" }, 403);
  }

  const { id } = await params;

  try {
    const limited = await rateLimit(
      `tutoring-request-prepare:${teachingUser.id}:${id}`,
      {
        bucket: "tutoring-request-prepare",
        limit: 20,
        window: "1 h",
      },
    );
    if (!limited.ok) {
      return routeJson(request,
        { error: "Too many tutoring preparation attempts." },
        429,
      );
    }
  } catch {
    return routeJson(request,
      { error: "Tutoring preparation is temporarily unavailable." },
      503,
    );
  }

  try {
    const result = await materializeTutoringSessionForRequest({
      requestId: id,
      teachingUser,
    });

    return routeJson(request,
      result,
      result.resumed ? 200 : 201,
    );
  } catch (error) {
    if (error instanceof TutoringSessionMaterializationNotFoundError) {
      return routeJson(request,
        { error: error.message },
        404,
      );
    }

    if (error instanceof TutoringSessionContextRequiredError) {
      return routeJson(request,
        {
          error: error.message,
          code: "TUTORING_SESSION_CONTEXT_REQUIRED",
        },
        409,
      );
    }

    if (error instanceof TutoringSessionMaterializationConflictError) {
      return routeJson(request,
        {
          error: error.message,
          code: "TUTORING_SESSION_PREPARE_CONFLICT",
        },
        409,
      );
    }

    const code = String(
      (error as { code?: unknown } | null)?.code ?? "",
    );
    if (code === "P2034" || code === "P2002") {
      return routeJson(request,
        {
          error:
            "The tutoring session changed while it was being prepared. Try again.",
          code: "TUTORING_SESSION_PREPARE_RETRY",
        },
        409,
      );
    }

    console.error("[teacher tutoring prepare]", error);
    return routeJson(request,
      { error: "Tutoring session could not be prepared." },
      500,
    );
  }
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
