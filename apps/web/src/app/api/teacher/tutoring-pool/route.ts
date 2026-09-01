import {
  readJsonSafe,
} from "@/lib/practice/api/shared/http";
import { rateLimit } from "@/lib/security/ratelimit";
import { getTeachingUser } from "@/lib/teaching/teachingAccess";
import {
  getTutoringTeacherPoolMembership,
  setOwnTutoringTeacherPoolEnabled,
} from "@/lib/tutoring/tutoringRequestService";
import {
  TutoringTeacherPoolPatchSchema,
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
    pool: await getTutoringTeacherPoolMembership(teachingUser.id),
  });
}

export async function PATCH(request: Request) {
  if (!isAppMutationOriginAllowed(request)) {
    return routeJson(request, { error: "Forbidden." }, 403);
  }

  const teachingUser = await getTeachingUser();
  if (!teachingUser) {
    return routeJson(request, { error: "Forbidden" }, 403);
  }

  try {
    const limited = await rateLimit(
      `tutoring-pool-self:${teachingUser.id}`,
      {
        bucket: "tutoring-pool-self",
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

  const parsed = TutoringTeacherPoolPatchSchema.safeParse(
    await readJsonSafe(request),
  );
  if (!parsed.success) {
    return routeJson(request,
      {
        error: "Invalid tutoring pool update.",
        details: parsed.error.flatten(),
      },
      400,
    );
  }

  const pool = await setOwnTutoringTeacherPoolEnabled({
    userId: teachingUser.id,
    enabled: parsed.data.enabled,
  });

  return routeJson(request, { pool });
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
