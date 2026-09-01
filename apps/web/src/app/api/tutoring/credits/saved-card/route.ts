import { getCurrentUserAccess } from "@/lib/access/currentUserAccess";
import { isCheckoutAttemptId } from "@/lib/billing/checkoutAttempt";
import {
  appCorsJson,
  appCorsPreflight,
  isAppMutationOriginAllowed,
} from "@/lib/http/appCors";
import { readJsonSafe } from "@/lib/practice/api/shared/http";
import { rateLimit } from "@/lib/security/ratelimit";
import {
  createTutoringSavedCardPayment,
  TutoringSavedCardPaymentError,
} from "@/lib/tutoring/tutoringSavedCardPayment";
import {
  launchTutoringCreditPackagePresentation,
} from "@/lib/tutoring/tutoringCreditPackages";
import {
  isValidTutoringMinutes,
} from "@/lib/tutoring/tutoringPricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      checkoutAttemptId?: unknown;
      minutes?: unknown;
      confirmReuse?: unknown;
    } | null;

  if (
    body?.confirmReuse !== true
  ) {
    return appCorsJson(
      request,
      {
        error:
          "Explicit saved-card payment confirmation is required.",
      },
      { status: 400 },
    );
  }

  if (
    !isCheckoutAttemptId(
      body?.checkoutAttemptId,
    )
  ) {
    return appCorsJson(
      request,
      {
        error:
          "Invalid tutoring payment attempt.",
      },
      { status: 400 },
    );
  }

  if (
    !isValidTutoringMinutes(
      body?.minutes,
    )
  ) {
    return appCorsJson(
      request,
      {
        error:
          "Tutoring minutes must be whole minutes between 30 and 720.",
        packages:
          launchTutoringCreditPackagePresentation(),
      },
      { status: 400 },
    );
  }

  try {
    const limited =
      await rateLimit(
        `tutoring-saved-card:${access.user.id}`,
        {
          bucket:
            "tutoring-saved-card",
          limit: 12,
          window: "1 h",
        },
      );

    if (!limited.ok) {
      return appCorsJson(
        request,
        {
          error:
            "Too many tutoring payment attempts.",
        },
        { status: 429 },
      );
    }
  } catch {
    return appCorsJson(
      request,
      {
        error:
          "Saved-card payment is temporarily unavailable.",
      },
      { status: 503 },
    );
  }

  try {
    const result =
      await createTutoringSavedCardPayment({
        userId:
          access.user.id,
        checkoutAttemptId:
          body.checkoutAttemptId,
        minutes:
          body.minutes,
      });

    return appCorsJson(
      request,
      result,
    );
  } catch (error) {
    if (
      error instanceof
        TutoringSavedCardPaymentError
    ) {
      const status =
        error.code ===
          "NO_SAVED_PAYMENT_METHOD"
          ? 409
          : error.code ===
              "SAVED_CARD_DECLINED"
            ? 402
            : 409;

      return appCorsJson(
        request,
        {
          error:
            error.message,
          code:
            error.code,
        },
        { status },
      );
    }

    console.error(
      "[tutoring saved-card payment]",
      error,
    );

    return appCorsJson(
      request,
      {
        error:
          "Saved-card payment could not be started.",
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
