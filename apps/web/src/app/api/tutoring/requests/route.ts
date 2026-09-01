import { getCurrentUserAccess } from "@/lib/access/currentUserAccess";
import {
  appCorsJson,
  appCorsPreflight,
  isAppMutationOriginAllowed,
  isAppOriginAllowed,
} from "@/lib/http/appCors";
import { readJsonSafe } from "@/lib/practice/api/shared/http";
import { rateLimit } from "@/lib/security/ratelimit";
import {
  InsufficientTutoringCreditsError,
} from "@/lib/tutoring/tutoringCommercial";
import {
  TutoringRequestAttemptConflictError,
  createLearnerTutoringRequest,
  listLearnerTutoringRequests,
} from "@/lib/tutoring/tutoringRequestService";
import {
  TutoringCommercialRequestInputSchema,
} from "@/lib/validators/tutoringCommercialRequest";
import {
  notifyTutoringRequestSubmitted,
} from "@/lib/tutoring/tutoringLifecycleEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function learner(request: Request, mutation: boolean) {
  const originOk = mutation
    ? isAppMutationOriginAllowed(request)
    : isAppOriginAllowed(request);

  if (!originOk) {
    return {
      ok: false as const,
      response: appCorsJson(
        request,
        { error: "Forbidden." },
        { status: 403 },
      ),
    };
  }

  const access = await getCurrentUserAccess();
  if (
    !access.authenticated ||
    !access.user ||
    !access.capabilities.accessStudentApp
  ) {
    return {
      ok: false as const,
      response: appCorsJson(
        request,
        { error: "Authentication required." },
        { status: 401 },
      ),
    };
  }

  return { ok: true as const, userId: access.user.id };
}

export async function GET(request: Request) {
  const access = await learner(request, false);
  if (!access.ok) return access.response;

  const requests = await listLearnerTutoringRequests(access.userId);
  return appCorsJson(request, { requests });
}

export async function POST(request: Request) {
  const access = await learner(request, true);
  if (!access.ok) return access.response;

  try {
    const limited = await rateLimit(
      `tutoring-request-create:${access.userId}`,
      {
        bucket: "tutoring-request-create",
        limit: 12,
        window: "1 h",
      },
    );
    if (!limited.ok) {
      return appCorsJson(
        request,
        { error: "Too many tutoring requests." },
        { status: 429 },
      );
    }
  } catch {
    return appCorsJson(
      request,
      { error: "Tutoring requests are temporarily unavailable." },
      { status: 503 },
    );
  }

  const parsed = TutoringCommercialRequestInputSchema.safeParse(
    await readJsonSafe(request),
  );
  if (!parsed.success) {
    return appCorsJson(
      request,
      {
        error: "Invalid tutoring request.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const result = await createLearnerTutoringRequest({
      learnerId: access.userId,
      ...parsed.data,
    });

    if (!result.resumed) {
      try {
        await notifyTutoringRequestSubmitted({
          requestId: result.request.id,
        });
      } catch (emailError) {
        console.error(
          "[tutoring request email]",
          emailError,
        );
      }
    }

    return appCorsJson(
      request,
      result,
      { status: result.resumed ? 200 : 201 },
    );
  } catch (error) {
    if (error instanceof InsufficientTutoringCreditsError) {
      return appCorsJson(
        request,
        {
          error: "Not enough available tutoring minutes.",
          code: "INSUFFICIENT_TUTORING_CREDITS",
          availableMinutes: error.availableMinutes,
          requiredMinutes: error.requiredMinutes,
        },
        { status: 409 },
      );
    }

    if (error instanceof TutoringRequestAttemptConflictError) {
      return appCorsJson(
        request,
        {
          error: error.message,
          code: "TUTORING_REQUEST_ATTEMPT_CONFLICT",
        },
        { status: 409 },
      );
    }

    console.error("[tutoring request create]", error);
    return appCorsJson(
      request,
      { error: "Tutoring request could not be created." },
      { status: 500 },
    );
  }
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
