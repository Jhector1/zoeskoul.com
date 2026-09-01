
import { rateLimit } from "@/lib/security/ratelimit";
import { getTeachingUser } from "@/lib/teaching/teachingAccess";
import {
  TutoringBookingTeacherMismatchError,
  TutoringCommercialInvariantError,
  consumeTutoringBookingCredits,
} from "@/lib/tutoring/tutoringCommercial";
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
      `tutoring-booking-complete:${teachingUser.id}:${id}`,
      {
        bucket: "tutoring-booking-complete",
        limit: 20,
        window: "1 h",
      },
    );
    if (!limited.ok) {
      return routeJson(request,
        { error: "Too many tutoring completion attempts." },
        429,
      );
    }
  } catch {
    return routeJson(request,
      { error: "Tutoring completion is temporarily unavailable." },
      503,
    );
  }

  try {
    const balance = await consumeTutoringBookingCredits(id, {
      expectedTeacherId: teachingUser.id,
    });

    return routeJson(request, {
      ok: true,
      status: "completed",
      balance,
    });
  } catch (error) {
    if (error instanceof TutoringBookingTeacherMismatchError) {
      return routeJson(request,
        { error: "Tutoring booking not found." },
        404,
      );
    }

    if (error instanceof TutoringCommercialInvariantError) {
      return routeJson(request,
        {
          error: error.message,
          code: "TUTORING_BOOKING_COMPLETE_CONFLICT",
        },
        409,
      );
    }

    console.error("[teacher tutoring booking complete]", error);
    return routeJson(request,
      { error: "Tutoring booking could not be completed." },
      500,
    );
  }
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
