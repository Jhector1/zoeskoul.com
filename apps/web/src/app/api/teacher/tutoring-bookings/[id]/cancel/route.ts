
import { rateLimit } from "@/lib/security/ratelimit";
import { getTeachingUser } from "@/lib/teaching/teachingAccess";
import {
  TutoringBookingTeacherMismatchError,
  TutoringCommercialInvariantError,
  releaseTutoringBookingCreditsDetailed,
} from "@/lib/tutoring/tutoringCommercial";
import {
  notifyTutoringBookingCanceled,
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

  const teachingUser = await getTeachingUser();
  if (!teachingUser) {
    return routeJson(request, { error: "Forbidden" }, 403);
  }

  const { id } = await params;

  try {
    const limited = await rateLimit(
      `tutoring-booking-cancel:${teachingUser.id}:${id}`,
      {
        bucket: "tutoring-booking-cancel",
        limit: 20,
        window: "1 h",
      },
    );
    if (!limited.ok) {
      return routeJson(request,
        { error: "Too many tutoring cancellation attempts." },
        429,
      );
    }
  } catch {
    return routeJson(request,
      { error: "Tutoring cancellation is temporarily unavailable." },
      503,
    );
  }

  try {
    const released =
      await releaseTutoringBookingCreditsDetailed(id, {
        expectedTeacherId: teachingUser.id,
      });

    if (released.transitioned) {
      try {
        await notifyTutoringBookingCanceled({
          bookingId: id,
          canceledBy: "teacher",
        });
      } catch (emailError) {
        console.error(
          "[teacher tutoring cancellation email]",
          emailError,
        );
      }
    }

    return routeJson(request, {
      ok: true,
      status: "canceled",
      balance: released.balance,
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
          code: "TUTORING_BOOKING_CANCEL_CONFLICT",
        },
        409,
      );
    }

    console.error("[teacher tutoring booking cancel]", error);
    return routeJson(request,
      { error: "Tutoring booking could not be canceled." },
      500,
    );
  }
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
