import {
  exceedsContentLength,
  readJsonSafe,
} from "@/lib/practice/api/shared/http";
import { rateLimit } from "@/lib/security/ratelimit";
import { getTeachingUser } from "@/lib/teaching/teachingAccess";
import {
  InsufficientTutoringCreditsError,
  NoTutoringTeacherAvailableError,
  TutoringCommercialInvariantError,
  createTutoringBookingForRequest,
} from "@/lib/tutoring/tutoringCommercial";
import {
  TutoringTeacherScheduleRequestSchema,
} from "@/lib/validators/tutoringCommercialRequest";
import {
  notifyTutoringScheduled,
} from "@/lib/tutoring/tutoringLifecycleEmail";
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

  if (exceedsContentLength(request, 8 * 1024)) {
    return routeJson(request,
      { error: "Request body is too large." },
      413,
    );
  }

  const teachingUser = await getTeachingUser();
  if (!teachingUser) {
    return routeJson(request, { error: "Forbidden" }, 403);
  }

  const { id } = await params;

  try {
    const limited = await rateLimit(
      `tutoring-request-schedule:${teachingUser.id}:${id}`,
      {
        bucket: "tutoring-request-schedule",
        limit: 30,
        window: "1 h",
      },
    );
    if (!limited.ok) {
      return routeJson(request,
        { error: "Too many tutoring scheduling attempts." },
        429,
      );
    }
  } catch {
    return routeJson(request,
      { error: "Tutoring scheduling is temporarily unavailable." },
      503,
    );
  }

  const parsed = TutoringTeacherScheduleRequestSchema.safeParse(
    await readJsonSafe(request),
  );
  if (!parsed.success) {
    return routeJson(request,
      {
        error: "Invalid tutoring schedule.",
        details: parsed.error.flatten(),
      },
      400,
    );
  }

  try {
    const result = await createTutoringBookingForRequest({
      requestId: id,
      startsAt: new Date(parsed.data.startsAt),
      confirmedTeacherId: teachingUser.id,
    });

    try {
      await notifyTutoringScheduled({
        bookingId: result.booking.id,
      });
    } catch (emailError) {
      console.error(
        "[teacher tutoring schedule email]",
        emailError,
      );
    }

    return routeJson(request, result, 201);
  } catch (error) {
    if (error instanceof NoTutoringTeacherAvailableError) {
      return routeJson(request,
        {
          error:
            "This tutoring time is outside your availability or conflicts with another booking.",
          code: "TUTORING_SLOT_UNAVAILABLE",
        },
        409,
      );
    }

    if (error instanceof InsufficientTutoringCreditsError) {
      return routeJson(request,
        {
          error: "The learner no longer has enough available tutoring minutes.",
          code: "INSUFFICIENT_TUTORING_CREDITS",
          availableMinutes: error.availableMinutes,
          requiredMinutes: error.requiredMinutes,
        },
        409,
      );
    }

    if (error instanceof TutoringCommercialInvariantError) {
      return routeJson(request,
        {
          error: error.message,
          code: "TUTORING_SCHEDULE_CONFLICT",
        },
        409,
      );
    }

    console.error("[teacher tutoring schedule]", error);
    return routeJson(request,
      { error: "Tutoring session could not be scheduled." },
      500,
    );
  }
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
