import {
  readJsonSafe,
} from "@/lib/practice/api/shared/http";
import { rateLimit } from "@/lib/security/ratelimit";
import { getTeachingUser } from "@/lib/teaching/teachingAccess";
import {
  InvalidTutoringAvailabilityError,
  getOwnTutoringAvailability,
  replaceOwnTutoringAvailability,
} from "@/lib/tutoring/tutoringAvailability";
import {
  TutoringTeacherAvailabilityReplaceSchema,
} from "@/lib/validators/tutoringCommercialRequest";
import {
  appCorsJson,
  appCorsPreflight,
  isAppMutationOriginAllowed,
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

  return routeJson(request, {
    availability: await getOwnTutoringAvailability(teachingUser.id),
  });
}

export async function PUT(request: Request) {
  if (!isAppMutationOriginAllowed(request)) {
    return routeJson(request, { error: "Forbidden." }, 403);
  }

  const teachingUser = await getTeachingUser();
  if (!teachingUser) {
    return routeJson(request, { error: "Forbidden" }, 403);
  }

  try {
    const limited = await rateLimit(
      `tutoring-availability-self:${teachingUser.id}`,
      {
        bucket: "tutoring-availability-self",
        limit: 20,
        window: "1 h",
      },
    );
    if (!limited.ok) {
      return routeJson(request,
        { error: "Too many tutoring availability changes." },
        429,
      );
    }
  } catch {
    return routeJson(request,
      { error: "Tutoring availability is temporarily unavailable." },
      503,
    );
  }

  const parsed = TutoringTeacherAvailabilityReplaceSchema.safeParse(
    await readJsonSafe(request),
  );
  if (!parsed.success) {
    return routeJson(request,
      {
        error: "Invalid tutoring availability.",
        details: parsed.error.flatten(),
      },
      400,
    );
  }

  try {
    const availability = await replaceOwnTutoringAvailability({
      teacherId: teachingUser.id,
      timeZone: parsed.data.timeZone,
      windows: parsed.data.windows.map((window) => ({
        startsAt: new Date(window.startsAt),
        endsAt: new Date(window.endsAt),
      })),
    });

    return routeJson(request, { availability });
  } catch (error) {
    if (error instanceof InvalidTutoringAvailabilityError) {
      return routeJson(request,
        {
          error: error.message,
          code: "INVALID_TUTORING_AVAILABILITY",
        },
        400,
      );
    }

    console.error("[tutoring availability replace]", error);
    return routeJson(request,
      { error: "Tutoring availability could not be saved." },
      500,
    );
  }
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
