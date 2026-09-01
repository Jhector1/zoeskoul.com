import { getCurrentUserAccess } from "@/lib/access/currentUserAccess";
import {
  appCorsJson,
  appCorsPreflight,
  isAppMutationOriginAllowed,
} from "@/lib/http/appCors";
import { rateLimit } from "@/lib/security/ratelimit";
import {
  TutoringCommercialInvariantError,
} from "@/lib/tutoring/tutoringCommercial";
import {
  cancelLearnerTutoringRequest,
  LearnerTutoringRequestNotFoundError,
} from "@/lib/tutoring/tutoringLearnerCancellation";
import {
  notifyTutoringRequestCanceled,
} from "@/lib/tutoring/tutoringLifecycleEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  },
) {
  if (!isAppMutationOriginAllowed(request)) {
    return appCorsJson(
      request,
      { error: "Forbidden." },
      { status: 403 },
    );
  }

  const access = await getCurrentUserAccess();

  if (
    !access.authenticated ||
    !access.user ||
    !access.capabilities.accessStudentApp
  ) {
    return appCorsJson(
      request,
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const { id } = await params;

  try {
    const limited = await rateLimit(
      `tutoring-request-cancel:${access.user.id}:${id}`,
      {
        bucket: "tutoring-request-cancel",
        limit: 20,
        window: "1 h",
      },
    );

    if (!limited.ok) {
      return appCorsJson(
        request,
        { error: "Too many tutoring cancellation attempts." },
        { status: 429 },
      );
    }
  } catch {
    return appCorsJson(
      request,
      { error: "Tutoring cancellation is temporarily unavailable." },
      { status: 503 },
    );
  }

  try {
    const result = await cancelLearnerTutoringRequest({
      requestId: id,
      learnerId: access.user.id,
    });

    if (result.transitioned) {
      try {
        await notifyTutoringRequestCanceled({
          requestId: id,
          canceledBy: "learner",
        });
      } catch (emailError) {
        console.error(
          "[learner tutoring cancellation email]",
          emailError,
        );
      }
    }

    return appCorsJson(request, result);
  } catch (error) {
    if (error instanceof LearnerTutoringRequestNotFoundError) {
      return appCorsJson(
        request,
        { error: "Tutoring request not found." },
        { status: 404 },
      );
    }

    if (error instanceof TutoringCommercialInvariantError) {
      return appCorsJson(
        request,
        {
          error: error.message,
          code: "TUTORING_REQUEST_CANCEL_CONFLICT",
        },
        { status: 409 },
      );
    }

    console.error("[learner tutoring request cancel]", error);
    return appCorsJson(
      request,
      { error: "Tutoring request could not be canceled." },
      { status: 500 },
    );
  }
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
