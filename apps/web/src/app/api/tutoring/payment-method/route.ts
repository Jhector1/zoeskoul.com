import { getCurrentUserAccess } from "@/lib/access/currentUserAccess";
import {
  appCorsJson,
  appCorsPreflight,
  isAppMutationOriginAllowed,
} from "@/lib/http/appCors";
import { readJsonSafe } from "@/lib/practice/api/shared/http";
import { rateLimit } from "@/lib/security/ratelimit";
import {
  authorizeTutoringSavedPaymentMethodReuse,
  getTutoringSavedPaymentMethod,
} from "@/lib/tutoring/tutoringSavedPaymentMethod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
) {
  const access =
    await getCurrentUserAccess();

  if (
    !access.authenticated ||
    !access.user
  ) {
    return appCorsJson(
      request,
      {
        error:
          "Authentication required.",
      },
      { status: 401 },
    );
  }

  try {
    const paymentMethod =
      await getTutoringSavedPaymentMethod(
        access.user.id,
      );

    return appCorsJson(
      request,
      { paymentMethod },
    );
  } catch (error) {
    console.error(
      "[tutoring saved payment method]",
      error,
    );

    return appCorsJson(
      request,
      {
        error:
          "Saved payment method could not be loaded.",
      },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
) {
  if (
    !isAppMutationOriginAllowed(
      request,
    )
  ) {
    return appCorsJson(
      request,
      { error: "Forbidden." },
      { status: 403 },
    );
  }

  const access =
    await getCurrentUserAccess();

  if (
    !access.authenticated ||
    !access.user
  ) {
    return appCorsJson(
      request,
      {
        error:
          "Authentication required.",
      },
      { status: 401 },
    );
  }

  const body =
    (await readJsonSafe(
      request,
    )) as {
      confirmReuse?: unknown;
    } | null;

  if (
    body?.confirmReuse !== true
  ) {
    return appCorsJson(
      request,
      {
        error:
          "Explicit payment method reuse confirmation is required.",
      },
      { status: 400 },
    );
  }

  try {
    const limited =
      await rateLimit(
        `tutoring-payment-method-reuse:${access.user.id}`,
        {
          bucket:
            "tutoring-payment-method-reuse",
          limit: 12,
          window: "1 h",
        },
      );

    if (!limited.ok) {
      return appCorsJson(
        request,
        {
          error:
            "Too many payment method requests.",
        },
        { status: 429 },
      );
    }
  } catch {
    return appCorsJson(
      request,
      {
        error:
          "Saved payment method is temporarily unavailable.",
      },
      { status: 503 },
    );
  }

  try {
    const paymentMethod =
      await authorizeTutoringSavedPaymentMethodReuse(
        access.user.id,
      );

    if (!paymentMethod) {
      return appCorsJson(
        request,
        {
          error:
            "No saved payment method is available.",
        },
        { status: 404 },
      );
    }

    return appCorsJson(
      request,
      { paymentMethod },
    );
  } catch (error) {
    console.error(
      "[tutoring saved payment method reuse]",
      error,
    );

    return appCorsJson(
      request,
      {
        error:
          "Saved payment method could not be authorized.",
      },
      { status: 500 },
    );
  }
}

export function OPTIONS(
  request: Request,
) {
  return appCorsPreflight(
    request,
  );
}
